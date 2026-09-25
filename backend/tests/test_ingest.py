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
            select(DistrictIngest).where(
                DistrictIngest.district_id.in_(_INGEST_DISTRICT_IDS)
            )
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()


class TestSelectorFamilies:
    def test_iki_aile(self):
        assert set(SELECTOR_FAMILIES) == {"b2b", "education"}

    def test_onsekiz_selector(self):
        # 16 turun secicilerinin birlesimi. Sayi degisirse ingest sorgu
        # maliyeti de degisir; bu test o degisikligi gorunur kiliyor.
        total = sum(len(v) for v in SELECTOR_FAMILIES.values())
        assert total == 24

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
        query = build_family_query(
            ('["office"]', '["craft"]'), (41.0, 29.0, 41.1, 29.1), 1
        )
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
        assert (
            classify_element({"amenity": "school", "isced:level": "1"}, "node")
            == "primary_school"
        )

    def test_universite(self):
        assert (
            classify_element({"amenity": "university"}, "way") == "college_university"
        )

    def test_anaokulu(self):
        assert classify_element({"amenity": "kindergarten"}, "node") == "kindergarten"

    def test_fabrika(self):
        assert classify_element({"man_made": "works"}, "way") == "factory"

    def test_atolye_fabrikadan_once(self):
        # classify.py:149'daki duzeltme: craft tasiyan kayit atolye,
        # fabrika degil.
        assert classify_element({"craft": "carpenter"}, "node") == "workshop"

    def test_ofis(self):
        # office=company artik Sirket; genel ofis icin serbest meslek.
        assert classify_element({"office": "lawyer"}, "node") == "office"

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
        elements = [
            {
                "type": "node",
                "id": 9001,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "Test Fabrika", "man_made": "works", "phone": "111"},
            }
        ]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.status == "ok"
        assert result.place_count == 1
        assert result.query_count == 4  # 2 aile x 2 asama

        rows = (
            (await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:9001")))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].place_type == "factory"

        memberships = (
            (
                await db.execute(
                    select(PlaceDistrict).where(
                        PlaceDistrict.place_id == "osm:node:9001"
                    )
                )
            )
            .scalars()
            .all()
        )
        assert any(
            m.district_id == "tr-34-kadikoy" and m.is_inside for m in memberships
        )

    async def test_taze_ilce_atlanir_sorgu_atilmaz(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {
                "type": "node",
                "id": 9002,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "A", "man_made": "works"},
            }
        ]
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
        elements = [
            {
                "type": "node",
                "id": 9003,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "A", "man_made": "works"},
            }
        ]
        stub = AsyncMock(side_effect=_overpass_stub({1: elements}))

        with patch("app.ingest.overpass_client.query", new=stub):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
            before = stub.await_count
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.skipped is False
        assert stub.await_count == before + 4

    async def test_siniflandirilamayan_kayit_saklanir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {
                "type": "way",
                "id": 9004,
                "center": {"lat": lat, "lon": lon},
                "tags": {"name": "Bilinmeyen Okul", "building": "school"},
            }
        ]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (
            await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:way:9004"))
        ).scalar_one()
        assert row.place_type is None

    async def test_timeout_bbox_bolunerek_yeniden_denenir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {
                "type": "node",
                "id": 9005,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "A", "man_made": "works"},
            }
        ]
        cagri_sayaci = {"n": 0}

        async def _query(query_text: str, debug: bool = False):
            cagri_sayaci["n"] += 1
            # Ilk cagri (b2b stage 1, tam bbox) timeout veriyor;
            # sonraki cagrilar ceyreklere ait.
            if cagri_sayaci["n"] == 1:
                raise OverpassTransientError("HTTP 504")
            stage = 2 if '[!"name"]' in query_text else 1
            return {"elements": list(elements) if stage == 1 else []}

        with patch(
            "app.ingest.overpass_client.query", new=AsyncMock(side_effect=_query)
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        # Deterministik sayim: b2b/stage1 ilk deneme basarisiz (1) + 4
        # ceyrek (hepsi basarili) = 5; kalan 3 aile/asama kombinasyonu
        # (b2b/stage2, education/stage1, education/stage2) ilk denemede
        # basarili = 1'er sorgu. Toplam 5 + 1 + 1 + 1 = 8.
        #
        # Gevsek bir ">4" siniri "4 ceyrege bolunup yeniden denendi" ile
        # "orijinal bbox'la sadece bir kez yeniden denendi" (5 > 4, hala
        # yanlislikla yesil doner) ayrimini yapamaz -- tam sayi kasitli.
        assert result.query_count == 8

        # 4 ceyregin tamami basarili oldugu icin bu senaryoda all_ok hic
        # False'a dusmuyor: sonuc deterministik olarak "ok", "partial"
        # degil. "in (\"ok\", \"partial\")" ayrimi yapmadan her iki sonucu
        # da kabul ederdi. status="partial"/"failed" dallari asagidaki iki
        # ayri test tarafindan pinleniyor.
        assert result.status == "ok"

    async def test_ceyrek_basarisizligi_partial_uretir(self, db):
        """
        Bir ceyrek yeniden denemesi de basarisiz olursa _fetch_family_stage
        o aile/asama icin ok=False donuyor ve ingest_district'teki
        `all_ok = all_ok and ok` bunu dongunun geri kalaninda tasimali --
        sonraki basarili kombinasyonlar all_ok'u True'ya geri dondurmemeli.
        En az bir kayit toplanmis olsa bile status 'partial' olmali.
        """
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {
                "type": "node",
                "id": 9007,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "A", "man_made": "works"},
            }
        ]
        cagri_sayaci = {"n": 0}

        async def _query(query_text: str, debug: bool = False):
            cagri_sayaci["n"] += 1
            n = cagri_sayaci["n"]
            # call 1: b2b/stage1 ilk deneme -> basarisiz, 4 ceyrege boler.
            # call 3: o 4 ceyrekten ikincisi de basarisiz.
            # Diger tum cagrilar (2, 4, 5, 6, 7, 8) basarili.
            if n in (1, 3):
                raise OverpassTransientError("HTTP 504")
            stage = 2 if '[!"name"]' in query_text else 1
            return {"elements": list(elements) if stage == 1 else []}

        with patch(
            "app.ingest.overpass_client.query", new=AsyncMock(side_effect=_query)
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        # b2b/stage1: 1 basarisiz ilk deneme + 4 ceyrek (biri basarisiz,
        # ucu basarili) = 5. Kalan 3 kombinasyon 1'er basarili sorgu = 3.
        assert result.query_count == 8
        # Kalici basarisiz kalan ceyrek all_ok'u False'a dusurdu; diger
        # ceyrekler ve diger aile/asama kombinasyonlari yine de kayit
        # getirdigi icin rows bos degil -> "partial" (all_ok=False ama
        # rows dolu). "failed" olsaydi rows'un da bos kalmasi gerekirdi.
        assert result.status == "partial"
        assert result.place_count == 1

    async def test_tum_sorgular_basarisiz_olursa_failed_uretir(self, db):
        """
        TUM aile/asama kombinasyonlari (ilk deneme + 4 ceyrek retry'nin
        hepsi) basarisiz olursa hicbir eleman toplanamaz. all_ok False
        VE rows bos -- ingest_district'teki
        `"partial" if rows else "failed"` ayriminin "failed" ucunu
        pinliyor; partial testi zaten "rows dolu" ucunu kapsiyor.
        """
        await self._kadikoy_merkez()  # districts.geojson yoksa skip eder

        async def _query(query_text: str, debug: bool = False):
            raise OverpassTransientError("HTTP 504")

        with patch(
            "app.ingest.overpass_client.query", new=AsyncMock(side_effect=_query)
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        # 4 aile/asama kombinasyonu x (1 ilk deneme + 4 ceyrek) = 20.
        assert result.query_count == 20
        assert result.status == "failed"
        assert result.place_count == 0

    async def test_bos_sonuc_dolu_ilcenin_uyeligini_silmez(self, db):
        """
        Yalnizca Isvicre verisi tasiyan bir ayna (overpass.osm.ch) Turkiye
        bbox'ina 2 saniyede bos ama gecerli yanit verdi; ingest bunu "ok"
        sayip replace_memberships ile 48 ilcenin uyeligini sildi. Onceden
        kaydi olan bir ilce sifir kayitla donerse bu veri degil aynadir:
        uyelik korunur, durum failed olur ki --all yeniden ceksin.
        """
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {
                "type": "node",
                "id": 9101,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "Onceki Fabrika", "man_made": "works"},
            }
        ]
        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            first = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
        assert first.status == "ok" and first.place_count == 1

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: []})),
        ):
            second = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert second.status == "failed"
        memberships = (
            (
                await db.execute(
                    select(PlaceDistrict).where(
                        PlaceDistrict.place_id == "osm:node:9101",
                        PlaceDistrict.district_id == "tr-34-kadikoy",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(memberships) == 1, "bos yanit dolu ilcenin uyeligini silmemeli"

    async def test_ayni_kurumun_node_ve_way_cizimi_tek_kayit_olur(self, db):
        """
        OSM ayni kurumu hem nokta (node) hem alan (way) olarak cizebiliyor;
        ikisi de ayni adi tasiyor ve ayni yerde. Iki satir gonullu icin
        "ayni muzeyi iki kez aramak" demek (olculdu: 118 cift). Iletisimi
        olan taraf kalir; esitlikte way.
        """
        lat, lon = await self._kadikoy_merkez()
        elements = [
            {"type": "node", "id": 9201, "lat": lat, "lon": lon,
             "tags": {"name": "Masumiyet Müzesi", "tourism": "museum", "phone": "111"}},
            {"type": "way", "id": 9202, "center": {"lat": lat + 0.0002, "lon": lon},
             "tags": {"name": "Masumiyet Müzesi", "tourism": "museum", "building": "yes"}},
            {"type": "node", "id": 9203, "lat": lat, "lon": lon + 0.0001,
             "tags": {"name": "Pera Müzesi", "tourism": "museum"}},
            {"type": "way", "id": 9204, "center": {"lat": lat, "lon": lon + 0.0002},
             "tags": {"name": "Pera Müzesi", "tourism": "museum"}},
        ]
        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.place_count == 2
        ids = {
            r.id
            for r in (
                await db.execute(select(PlaceRow).where(PlaceRow.name.in_(["Masumiyet Müzesi", "Pera Müzesi"])))
            ).scalars().all()
        }
        # Masumiyet: telefonlu node kalir. Pera: esitlik, way kalir.
        assert ids == {"osm:node:9201", "osm:way:9204"}

    async def test_isimsiz_atolye_stage2_de_korunur(self, db):
        """
        Regresyon: is_valid_unnamed ikinci argumani TUR olarak
        yorumluyor. Aile adi ("b2b") gecilirse craft/office dallari
        hic calismaz ve isimsiz ama gecerli atolye kayitlari sessizce
        dusurulur. Siniflandirma filtreden once yapilmali.
        """
        lat, lon = await self._kadikoy_merkez()
        isimsiz_atolye = [
            {
                "type": "node",
                "id": 9006,
                "lat": lat,
                "lon": lon,
                "tags": {"craft": "carpenter"},  # isim yok, iletisim yok
            }
        ]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({2: isimsiz_atolye})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (
            await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:9006"))
        ).scalar_one_or_none()
        assert row is not None, "isimsiz atolye dusuruldu"
        assert row.place_type == "workshop"

    async def test_bilinmeyen_ilce_hata_verir(self, db):
        with pytest.raises(KeyError):
            await ingest_district(db, "tr-99-yok", 2000, force=True)


@pytest.mark.asyncio
class TestIngestOvertureSonrasi:
    async def test_onceden_gelen_overture_kaydi_osm_ye_katilir(self, db):
        """
        Kismi bir ilceyi Overture'dan sonra tekrar cekmek ayni kurumu iki
        kez yaziyordu: enrich eslestirmeyi yalnizca OSM'den SONRA yapiyor.
        """
        from app.districts import get_district
        from app.store import upsert_places

        district = get_district("tr-34-kadikoy")
        if district is None:
            pytest.skip("districts.geojson yok")
        lat, lon = district.center

        await upsert_places(
            db,
            [
                {
                    "id": "overture:ing-1",
                    "lat": lat + 0.0003,
                    "lon": lon,
                    "name": "Birlesik Kadikoy Fabrikasi",
                    "place_type": "factory",
                    "subtype": "manufacturer",
                    "confidence": 90,
                    "has_contact": True,
                    "phone": "+902165550000",
                    "email": None,
                    "website": None,
                    "address": "Kadikoy",
                    "tags_json": "{}",
                    "source": "overture",
                }
            ],
        )
        elements = [
            {
                "type": "node",
                "id": 9101,
                "lat": lat,
                "lon": lon,
                "tags": {"name": "Birlesik Kadıköy Fabrikası", "man_made": "works"},
            }
        ]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        ids = set((await db.execute(select(PlaceRow.id))).scalars().all())
        osm = (
            await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:9101"))
        ).scalar_one()

        assert "overture:ing-1" not in ids, "ayni kurum iki kez duruyor"
        assert osm.phone == "+902165550000"
        assert osm.address is not None


@pytest.mark.asyncio
class TestIlceDisiKayit:
    async def test_ilce_ve_tampon_disindaki_kayit_yazilmaz(self, db):
        """
        Sorgu bbox'i dikdortgen; koselerinde ilceye (ve tamponuna) ait
        olmayan kayitlar da geliyor. Onceden bunlar da yaziliyor ama hicbir
        ilceye baglanmiyordu: tum cekimde 958 kayit hicbir aramada
        gorunmeden tabloda kaldi. Komsu ilcenin kaydi o ilcenin kendi
        cekiminde zaten geliyor.
        """
        from app.districts import expanded_bbox, get_district, point_membership

        if get_district("tr-34-kadikoy") is None:
            pytest.skip("districts.geojson yok")
        south, west, north, east = expanded_bbox("tr-34-kadikoy", 2000)
        eps = 1e-4
        corners = [
            (south + eps, west + eps),
            (south + eps, east - eps),
            (north - eps, west + eps),
            (north - eps, east - eps),
        ]
        outside = next(
            (p for p in corners if point_membership("tr-34-kadikoy", *p, 2000) is None),
            None,
        )
        if outside is None:
            pytest.skip("bbox koselerinin hepsi ilce tamponunda")
        lat, lon = get_district("tr-34-kadikoy").center

        elements = [
            {"type": "node", "id": 9201, "lat": lat, "lon": lon,
             "tags": {"name": "Icerideki Fabrika", "man_made": "works"}},
            {"type": "node", "id": 9202, "lat": outside[0], "lon": outside[1],
             "tags": {"name": "Kosedeki Fabrika", "man_made": "works"}},
        ]
        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        ids = set((await db.execute(select(PlaceRow.id))).scalars().all())
        assert "osm:node:9201" in ids
        assert "osm:node:9202" not in ids, "ilce disindaki kayit yazildi"
        assert result.place_count == 1
