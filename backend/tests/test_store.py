"""
Veri erisim katmani: has_contact turetimi, upsert, uyelik degistirme.
"""

import pytest
from sqlalchemy import select

from app.database import (
    AsyncSessionLocal,
    DistrictIngest,
    PlaceDistrict,
    PlaceRow,
    init_db,
)
from app.store import (
    derive_has_contact,
    extract_contact,
    get_ingest_state,
    mark_ingest,
    place_row_values,
    replace_memberships,
    upsert_places,
)

# Bu modulun DistrictIngest'e yazdigi ilceler. Tabloyu tamamen bosaltmak
# yerine (T6'nin kendi ingest testleri de bu tabloyu kullanacak, farkli
# district_id'lerle) yalnizca bu ikisini siliyoruz -- ayni yaklasim
# test_district_tables.py'deki _INGEST_DISTRICT_ID ile.
_INGEST_DISTRICT_IDS = ("tr-59-cerkezkoy", "tr-59-corlu")


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session
        # Test izolasyonu: bu dosyanin yazdigi satirlari temizle.
        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        # DistrictIngest'in PlaceRow/PlaceDistrict'e FK'i yok, yani
        # yukaridaki silme dongusunden hic etkilenmiyor. TestIngestState'in
        # yazdigi satirlar elle silinmezse test_storage.db'de kalici olur
        # ve ileride ayni district_id'yi kullanan baska bir test modulunu
        # (veya calisma sirasina gore ayni testi) sessizce etkileyebilir --
        # tam olarak T4'un DistrictIngest icin surdugu ayrik silme deseni.
        result = await session.execute(
            select(DistrictIngest).where(
                DistrictIngest.district_id.in_(_INGEST_DISTRICT_IDS)
            )
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()


class TestDeriveHasContact:
    def test_duz_telefon(self):
        assert derive_has_contact({"phone": "+902161234567"}) is True

    def test_onekli_telefon(self):
        assert derive_has_contact({"contact:phone": "+902161234567"}) is True

    def test_mobil(self):
        assert derive_has_contact({"mobile": "+905321234567"}) is True

    def test_email_ve_website(self):
        assert derive_has_contact({"email": "a@b.com"}) is True
        assert derive_has_contact({"website": "https://x.com"}) is True
        assert derive_has_contact({"contact:website": "https://x.com"}) is True

    def test_yalniz_faks_sayilmaz(self):
        # Spec karari: faks saklaniyor ama ulasilabilirlik sinyali degil.
        assert derive_has_contact({"fax": "+902161234567"}) is False

    def test_iletisim_yok(self):
        assert derive_has_contact({"man_made": "works", "name": "X"}) is False

    def test_bos_deger_sayilmaz(self):
        assert derive_has_contact({"phone": ""}) is False


class TestExtractContact:
    def test_duz_etiketler_oncelikli(self):
        phone, email, website = extract_contact(
            {
                "phone": "111",
                "contact:phone": "222",
                "email": "a@b.com",
                "website": "https://x.com",
            }
        )
        assert phone == "111"
        assert email == "a@b.com"
        assert website == "https://x.com"

    def test_onekli_etiketlere_geri_duser(self):
        phone, email, website = extract_contact(
            {
                "contact:phone": "222",
                "contact:email": "c@d.com",
                "contact:website": "https://y.com",
            }
        )
        assert (phone, email, website) == ("222", "c@d.com", "https://y.com")

    def test_mobil_telefon_yerine_gecer(self):
        phone, _, _ = extract_contact({"mobile": "+905321234567"})
        assert phone == "+905321234567"


class TestPlaceRowValues:
    def test_node_elemani(self):
        element = {
            "type": "node",
            "id": 123,
            "lat": 41.0,
            "lon": 29.0,
            "tags": {"name": "Test Fabrika", "man_made": "works", "phone": "111"},
        }
        values = place_row_values(element, "factory", 60, "Test Mah.")

        assert values["id"] == "osm:node:123"
        assert values["lat"] == 41.0
        assert values["name"] == "Test Fabrika"
        assert values["place_type"] == "factory"
        assert values["has_contact"] is True
        assert values["phone"] == "111"

    def test_way_elemani_center_kullanir(self):
        # Overpass `out center` way/relation icin center alani doner.
        element = {
            "type": "way",
            "id": 456,
            "center": {"lat": 41.5, "lon": 29.5},
            "tags": {"building": "industrial"},
        }
        values = place_row_values(element, "factory", 40, None)

        assert values["id"] == "osm:way:456"
        assert values["lat"] == 41.5
        assert values["lon"] == 29.5
        assert values["name"] is None

    def test_koordinatsiz_eleman_none_dondurur(self):
        element = {"type": "relation", "id": 789, "tags": {"office": "company"}}
        assert place_row_values(element, "office", 40, None) is None


@pytest.mark.asyncio
class TestUpsertPlaces:
    async def test_yeni_kayit_eklenir(self, db):
        rows = [
            place_row_values(
                {
                    "type": "node",
                    "id": 2001,
                    "lat": 41.0,
                    "lon": 29.0,
                    "tags": {"name": "A", "man_made": "works"},
                },
                "factory",
                60,
                None,
            )
        ]
        assert await upsert_places(db, rows) == 1

        result = await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:2001")
        )
        assert result.scalar_one().name == "A"

    async def test_ayni_id_guncellenir_cogaltilmaz(self, db):
        base = {"type": "node", "id": 2002, "lat": 41.0, "lon": 29.0}
        await upsert_places(
            db,
            [
                place_row_values(
                    {**base, "tags": {"name": "Eski", "man_made": "works"}},
                    "factory",
                    60,
                    None,
                )
            ],
        )
        await upsert_places(
            db,
            [
                place_row_values(
                    {
                        **base,
                        "tags": {"name": "Yeni", "man_made": "works", "phone": "111"},
                    },
                    "factory",
                    70,
                    None,
                )
            ],
        )

        result = await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:2002")
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].name == "Yeni"
        assert rows[0].has_contact is True

    async def test_yeniden_cekim_dolu_iletisimi_bosla_ezmez(self, db):
        """
        Overture enrich OSM'de bos olan telefonu doldurur. Sonraki tam OSM
        cekimi ayni kaydi telefonsuz getirir; upsert dolu alani bosla
        ezmemeli, yoksa zenginlestirme sessizce kaybolur.
        """
        base = {"type": "node", "id": 2003, "lat": 41.0, "lon": 29.0}
        await upsert_places(
            db,
            [
                place_row_values(
                    {**base, "tags": {"name": "A", "man_made": "works", "phone": "111"}},
                    "factory",
                    60,
                    None,
                )
            ],
        )
        await upsert_places(
            db,
            [
                place_row_values(
                    {**base, "tags": {"name": "A", "man_made": "works"}},
                    "factory",
                    60,
                    None,
                )
            ],
        )
        result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:2003"))
        row = result.scalar_one()
        assert row.phone == "111"
        assert row.has_contact is True


@pytest.mark.asyncio
class TestReplaceMemberships:
    async def test_ilcenin_uyelikleri_degistirilir(self, db):
        await upsert_places(
            db,
            [
                place_row_values(
                    {
                        "type": "node",
                        "id": 3001,
                        "lat": 41.0,
                        "lon": 29.0,
                        "tags": {"man_made": "works"},
                    },
                    "factory",
                    60,
                    None,
                )
            ],
        )

        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3001", True)])
        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3001", False)])

        result = await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.district_id == "tr-34-kadikoy")
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].is_inside is False

    async def test_diger_ilcenin_uyelikleri_korunur(self, db):
        # Kadikoy yeniden ingest edilirken Atasehir'in uyelikleri
        # silinmemeli; ayni kayit ikisine de uye olabiliyor.
        await upsert_places(
            db,
            [
                place_row_values(
                    {
                        "type": "node",
                        "id": 3002,
                        "lat": 41.0,
                        "lon": 29.0,
                        "tags": {"man_made": "works"},
                    },
                    "factory",
                    60,
                    None,
                )
            ],
        )

        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3002", True)])
        await replace_memberships(db, "tr-34-atasehir", [("osm:node:3002", False)])
        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3002", True)])

        result = await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:3002")
        )
        assert len(result.scalars().all()) == 2

    async def test_cagri_ici_tekrar_eden_place_id_cogaltilmaz(self, db):
        # Review bulgusu: bir way/relation, ingest bbox'i timeout sonrasi
        # ceyreklere bolununce (T6 split_bbox) birden fazla ceyrekten
        # donebiliyor, yani ayni district_id icin ayni place_id tek
        # replace_memberships cagrisinda iki kez gelebiliyor. ON CONFLICT
        # olmadan bu toplu INSERT SQLite'ta "UNIQUE constraint failed"
        # ile patlardi -- upsert_places'in zaten cozdugu sorunun aynisi.
        await upsert_places(
            db,
            [
                place_row_values(
                    {
                        "type": "node",
                        "id": 3003,
                        "lat": 41.0,
                        "lon": 29.0,
                        "tags": {"man_made": "works"},
                    },
                    "factory",
                    60,
                    None,
                )
            ],
        )

        await replace_memberships(
            db,
            "tr-34-kadikoy",
            [("osm:node:3003", True), ("osm:node:3003", False)],
        )

        result = await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.district_id == "tr-34-kadikoy")
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].is_inside is False


@pytest.mark.asyncio
class TestIngestState:
    async def test_yazilir_ve_okunur(self, db):
        await mark_ingest(db, "tr-59-cerkezkoy", 412, 4, "ok")
        state = await get_ingest_state(db, "tr-59-cerkezkoy")

        assert state is not None
        assert state.place_count == 412
        assert state.status == "ok"

    async def test_tekrar_isaretleme_gunceller(self, db):
        await mark_ingest(db, "tr-59-corlu", 100, 4, "partial")
        await mark_ingest(db, "tr-59-corlu", 250, 8, "ok")

        state = await get_ingest_state(db, "tr-59-corlu")
        assert state.place_count == 250
        assert state.status == "ok"

    async def test_bilinmeyen_ilce_none(self, db):
        assert await get_ingest_state(db, "tr-99-yok") is None
