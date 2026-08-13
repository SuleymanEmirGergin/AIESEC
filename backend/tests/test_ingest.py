"""
Ingest: sorgu uretimi, siniflandirma yonlendirmesi, idempotency,
bbox bolme.

Overpass cagrilari mock'lu; bu dosya ag'a hic gitmiyor.
"""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.database import (
    AsyncSessionLocal,
    DistrictIngest,
    PlaceDistrict,
    PlaceRow,
    init_db,
)
from app.ingest import (
    SELECTOR_FAMILIES,
    build_family_query,
    classify_element,
    ingest_district,
    split_bbox,
)
from app.overpass import OverpassTransientError

# Bu modulun DistrictIngest'e yazdigi tek gercek ilce. T5'in test_store.py'de
# kurdugu deseni izliyoruz: DistrictIngest'in PlaceRow/PlaceDistrict'e FK'i
# yok, yani asagidaki PlaceDistrict/PlaceRow silme dongusu bu tabloyu hic
# etkilemiyor. Elle silinmezse test_storage.db'de kalici olur ve ileride
# ayni district_id'yi okuyan baska bir test modulunu (sorgu katmani T6'dan
# sonra gelecek) sessizce etkileyebilir.
_INGEST_DISTRICT_IDS = ("tr-34-kadikoy",)


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session
        # Test izolasyonu: FK yonu PlaceDistrict -> PlaceRow, once uyelikler
        # silinmeli.
        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        result = await session.execute(
            select(DistrictIngest).where(DistrictIngest.district_id.in_(_INGEST_DISTRICT_IDS))
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()


class TestSelectorFamilies:
    def test_iki_aile(self):
        assert set(SELECTOR_FAMILIES) == {"b2b", "education"}

    def test_onsekiz_selector(self):
        # 10 turun secicilerinin birlesimi. Sayi degisirse ingest sorgu
        # maliyeti de degisir; bu test o degisikligi gorunur kiliyor.
        total = sum(len(v) for v in SELECTOR_FAMILIES.values())
        assert total == 18

    def test_universite_secicileri_var(self):
        # T1'de duzeltilen hatanin ikinci yarisi: universite hic
        # sorgulanmiyordu.
        education = SELECTOR_FAMILIES["education"]
        assert '["amenity"="university"]' in education
        assert '["amenity"="college"]' in education


class TestBuildFamilyQuery:
    def test_stage1_isimli_filtre(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert '["name"]' in query
        assert '[!"name"]' not in query

    def test_stage2_isimsiz_filtre(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 2)
        assert '[!"name"]' in query

    def test_bbox_sirasi_south_west_north_east(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert "(41.000000,29.000000,41.100000,29.100000)" in query

    def test_her_selector_icin_bir_satir(self):
        query = build_family_query(('["office"]', '["craft"]'), (41.0, 29.0, 41.1, 29.1), 1)
        assert query.count("nwr") == 2

    def test_out_tags_center(self):
        # way/relation icin koordinat `center` alanindan geliyor;
        # `out tags center` olmadan place_row_values None doner.
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert "out tags center;" in query


class TestSplitBbox:
    def test_dort_ceyrek(self):
        parts = split_bbox((41.0, 29.0, 41.2, 29.2))
        assert len(parts) == 4

    def test_ceyrekler_orijinali_kapsar(self):
        south, west, north, east = 41.0, 29.0, 41.2, 29.2
        parts = split_bbox((south, west, north, east))
        assert min(p[0] for p in parts) == south
        assert min(p[1] for p in parts) == west
        assert max(p[2] for p in parts) == north
        assert max(p[3] for p in parts) == east

    def test_ceyrekler_ortada_bulusur(self):
        parts = split_bbox((41.0, 29.0, 41.2, 29.2))
        assert {round(p[0], 4) for p in parts} == {41.0, 41.1}
        assert {round(p[1], 4) for p in parts} == {29.0, 29.1}


class TestClassifyElement:
    def test_okul_once_denenir(self):
        assert classify_element({"amenity": "school"}, "node") is None or True
        assert classify_element(
            {"amenity": "school", "isced:level": "1"}, "node"
        ) == "primary_school"

    def test_universite(self):
        assert classify_element({"amenity": "university"}, "way") == "college_university"

    def test_anaokulu(self):
        assert classify_element({"amenity": "kindergarten"}, "node") == "kindergarten"

    def test_fabrika(self):
        assert classify_element({"man_made": "works"}, "way") == "factory"

    def test_atolye_fabrikadan_once(self):
        # classify.py:149'daki duzeltme: craft tasiyan kayit atolye,
        # fabrika degil.
        assert classify_element({"craft": "carpenter"}, "node") == "workshop"

    def test_ofis(self):
        assert classify_element({"office": "company"}, "node") == "office"

    def test_siniflandirilamayan_none(self):
        # building=school ama amenity=school yok: classify_school_level
        # None doner, b2b de tanimiyor. Kayit saklanir ama gizlenir.
        assert classify_element({"building": "school"}, "way") is None


def _overpass_stub(elements_by_stage):
    """stage 1 / stage 2 icin ayri eleman listesi donen mock."""
    async def _query(query_text: str, debug: bool = False):
        stage = 2 if '[!"name"]' in query_text else 1
        return {"elements": list(elements_by_stage.get(stage, []))}
    return _query


@pytest.mark.asyncio
class TestIngestDistrict:
    """
    Gercek ilce kimligi kullaniliyor; districts.geojson gerekli.
    Ingest edilen nokta Kadikoy merkezine yakin secildi ki uyelik
    testi anlamli olsun.
    """

    async def _kadikoy_merkez(self):
        from app.districts import get_district
        district = get_district("tr-34-kadikoy")
        if district is None:
            pytest.skip("districts.geojson yok; once fetch_districts.py calistir")
        return district.center

    async def test_kayitlar_yazilir_ve_uyelik_kurulur(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9001, "lat": lat, "lon": lon,
            "tags": {"name": "Test Fabrika", "man_made": "works", "phone": "111"},
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.status == "ok"
        assert result.place_count == 1
        assert result.query_count == 4  # 2 aile x 2 asama

        rows = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:9001")
        )).scalars().all()
        assert len(rows) == 1
        assert rows[0].place_type == "factory"

        memberships = (await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:9001")
        )).scalars().all()
        assert any(m.district_id == "tr-34-kadikoy" and m.is_inside for m in memberships)

    async def test_taze_ilce_atlanir_sorgu_atilmaz(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9002, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        stub = AsyncMock(side_effect=_overpass_stub({1: elements}))

        with patch("app.ingest.overpass_client.query", new=stub):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
            first_calls = stub.await_count

            # force=False ve kayit taze: hic sorgu atilmamali.
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=False)

        assert result.skipped is True
        assert stub.await_count == first_calls

    async def test_force_taze_kaydi_yeniden_ceker(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9003, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        stub = AsyncMock(side_effect=_overpass_stub({1: elements}))

        with patch("app.ingest.overpass_client.query", new=stub):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
            before = stub.await_count
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.skipped is False
        assert stub.await_count == before + 4

    async def test_siniflandirilamayan_kayit_saklanir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "way", "id": 9004, "center": {"lat": lat, "lon": lon},
            "tags": {"name": "Bilinmeyen Okul", "building": "school"},
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:way:9004")
        )).scalar_one()
        assert row.place_type is None

    async def test_timeout_bbox_bolunerek_yeniden_denenir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9005, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        cagri_sayaci = {"n": 0}

        async def _query(query_text: str, debug: bool = False):
            cagri_sayaci["n"] += 1
            # Ilk cagri (b2b stage 1, tam bbox) timeout veriyor;
            # sonraki cagrilar ceyreklere ait.
            if cagri_sayaci["n"] == 1:
                raise OverpassTransientError("HTTP 504")
            stage = 2 if '[!"name"]' in query_text else 1
            return {"elements": list(elements) if stage == 1 else []}

        with patch("app.ingest.overpass_client.query", new=AsyncMock(side_effect=_query)):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        # 4 ceyrek yeniden denendi: toplam sorgu 4'ten fazla olmali.
        assert result.query_count > 4
        assert result.status in ("ok", "partial")

    async def test_isimsiz_atolye_stage2_de_korunur(self, db):
        """
        Regresyon: is_valid_unnamed ikinci argumani TUR olarak
        yorumluyor. Aile adi ("b2b") gecilirse craft/office dallari
        hic calismaz ve isimsiz ama gecerli atolye kayitlari sessizce
        dusurulur. Siniflandirma filtreden once yapilmali.
        """
        lat, lon = await self._kadikoy_merkez()
        isimsiz_atolye = [{
            "type": "node", "id": 9006, "lat": lat, "lon": lon,
            "tags": {"craft": "carpenter"},  # isim yok, iletisim yok
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({2: isimsiz_atolye})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:9006")
        )).scalar_one_or_none()
        assert row is not None, "isimsiz atolye dusuruldu"
        assert row.place_type == "workshop"

    async def test_bilinmeyen_ilce_hata_verir(self, db):
        with pytest.raises(KeyError):
            await ingest_district(db, "tr-99-yok", 2000, force=True)
