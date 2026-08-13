"""
Filtre -> SQL cevirisi ve siralama.

Her filtre kombinasyonu gercek satirlar uzerinde dogrulaniyor;
sorgu metnine degil sonuc kumesine bakiyoruz.
"""

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, PlaceDistrict, PlaceRow, init_db
from app.queries import (
    VALID_SORTS,
    PlaceFilter,
    count_by_type,
    fetch_places,
    lead_score,
    sort_in_python,
)
from app.store import place_row_values, replace_memberships, upsert_places

D = "tr-34-test"
OTHER = "tr-34-diger"


def _element(osm_id: int, tags: dict, lat=41.0, lon=29.0) -> dict:
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": tags}


@pytest.fixture
async def db():
    """Bilinen bir veri kumesi kur: 6 kayit, 2 ilce."""
    await init_db()
    async with AsyncSessionLocal() as session:
        alfa_tags = {"name": "Alfa Fabrika", "man_made": "works", "phone": "111"}
        beta_tags = {"name": "Beta Fabrika", "man_made": "works"}
        isimsiz_tags = {"man_made": "works"}
        gama_tags = {
            "name": "Gama Ofis", "office": "company", "website": "https://g.com",
        }
        delta_tags = {"name": "Delta Anaokulu", "amenity": "kindergarten"}
        bilinmeyen_tags = {"name": "Bilinmeyen", "building": "school"}

        rows = [
            place_row_values(_element(1, alfa_tags), "factory", 70, None),
            place_row_values(_element(2, beta_tags), "factory", 70, None),
            place_row_values(_element(3, isimsiz_tags), "factory", 40, None),
            place_row_values(_element(4, gama_tags), "office", 70, None),
            place_row_values(_element(5, delta_tags), "kindergarten", 70, None),
            place_row_values(_element(6, bilinmeyen_tags), None, 40, None),
        ]
        await upsert_places(session, rows)
        await replace_memberships(session, D, [
            ("osm:node:1", True), ("osm:node:2", True), ("osm:node:3", True),
            ("osm:node:4", True), ("osm:node:5", False), ("osm:node:6", True),
        ])
        await replace_memberships(session, OTHER, [("osm:node:1", False)])

        yield session

        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


def _ids(rows) -> set[str]:
    return {r.id for r in rows}


@pytest.mark.asyncio
class TestFiltreler:
    async def test_varsayilan_siniflandirilamayani_gizler(self, db):
        rows, total = await fetch_places(db, PlaceFilter(district_id=D))
        assert "osm:node:6" not in _ids(rows)
        assert total == 5

    async def test_include_unclassified_gosterir(self, db):
        rows, total = await fetch_places(
            db, PlaceFilter(district_id=D, include_unclassified=True)
        )
        assert "osm:node:6" in _ids(rows)
        assert total == 6

    async def test_tur_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, types=("factory",)))
        assert _ids(rows) == {"osm:node:1", "osm:node:2", "osm:node:3"}

    async def test_coklu_tur_filtresi(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, types=("office", "kindergarten"))
        )
        assert _ids(rows) == {"osm:node:4", "osm:node:5"}

    async def test_bos_tur_hepsini_getirir(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, types=()))
        assert len(rows) == 5

    async def test_has_contact_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, has_contact=True))
        assert _ids(rows) == {"osm:node:1", "osm:node:4"}

    async def test_named_only_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, named_only=True))
        assert "osm:node:3" not in _ids(rows)

    async def test_min_confidence_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, min_confidence=70))
        assert "osm:node:3" not in _ids(rows)

    async def test_metin_arama_buyuk_kucuk_duyarsiz(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, q="alfa"))
        assert _ids(rows) == {"osm:node:1"}

    async def test_include_buffer_false_tampon_kayitlarini_atar(self, db):
        # osm:node:5 bu ilcede is_inside=False.
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, include_buffer=False)
        )
        assert "osm:node:5" not in _ids(rows)

    async def test_include_buffer_true_tamponu_dahil_eder(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, include_buffer=True)
        )
        assert "osm:node:5" in _ids(rows)

    async def test_baska_ilcenin_kayitlari_gelmez(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=OTHER))
        assert _ids(rows) == {"osm:node:1"}

    async def test_filtreler_birlesir(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(
            district_id=D, types=("factory",), has_contact=True, named_only=True
        ))
        assert _ids(rows) == {"osm:node:1"}


@pytest.mark.asyncio
class TestSayfalama:
    async def test_limit_ve_offset(self, db):
        page1, total = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", limit=2, offset=0)
        )
        page2, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", limit=2, offset=2)
        )
        assert len(page1) == 2
        assert len(page2) == 2
        assert not (_ids(page1) & _ids(page2))
        # total sayfa boyutundan bagimsiz, filtrelenmis kumenin tamami.
        assert total == 5

    async def test_python_siralamasinda_da_sayfalama_dogru(self, db):
        page1, total = await fetch_places(
            db, PlaceFilter(district_id=D, sort="lead_score", limit=2, offset=0)
        )
        page2, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="lead_score", limit=2, offset=2)
        )
        assert len(page1) == 2
        assert not (_ids(page1) & _ids(page2))
        assert total == 5


@pytest.mark.asyncio
class TestSiralama:
    async def test_contact_first_iletisimlileri_one_alir(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="contact_first")
        )
        assert rows[0].has_contact is True
        assert rows[-1].has_contact is False

    async def test_name_alfabetik(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", named_only=True)
        )
        adlar = [r.name for r in rows]
        assert adlar == sorted(adlar)

    async def test_confidence_azalan(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, sort="confidence"))
        skorlar = [r.confidence for r in rows]
        assert skorlar == sorted(skorlar, reverse=True)

    async def test_ref_distance_yakindan_uzaga(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(
            district_id=D, sort="ref_distance", ref_lat=41.0, ref_lon=29.0
        ))
        assert len(rows) == 5  # hepsi ayni noktada; kirilmadan donmeli

    async def test_gecersiz_siralama_reddedilir(self, db):
        with pytest.raises(ValueError):
            await fetch_places(db, PlaceFilter(district_id=D, sort="DROP TABLE places"))


# TestSiralama'nin disinda: bu senkron bir test ve o sinif
# @pytest.mark.asyncio ile isaretli. Iceride birakmak pytest-asyncio'nun
# "sync test asyncio ile isaretlenmis" uyarisini tetikliyordu (yeni
# uyari = kusur, bkz. proje testi taban cizgisi).
def test_gecerli_siralamalar():
    assert VALID_SORTS == {
        "contact_first", "confidence", "name", "lead_score", "ref_distance"
    }


def test_ref_distance_referans_noktasi_yoksa_liste_degismez():
    # Karar (spec): ref_lat/ref_lon verilmediginde yanlis ama kesin bir
    # sira uretmek yerine kayitlar oldugu gibi doner. fetch_places'in
    # ref_distance testi her zaman referans noktasi veriyor, bu dali hic
    # calistirmiyor -- sort_in_python'u dogrudan sinamak gerekiyor.
    rows = [
        PlaceRow(id="osm:node:8", lat=40.9, lon=28.9),
        PlaceRow(id="osm:node:9", lat=41.1, lon=29.1),
    ]
    f = PlaceFilter(district_id=D, sort="ref_distance")
    assert sort_in_python(rows, f) is rows


class TestLeadScore:
    def _row(self, **kwargs) -> PlaceRow:
        defaults = dict(
            id="osm:node:1", lat=41.0, lon=29.0, name="Test", place_type="factory",
            subtype=None, confidence=70, has_contact=False, phone=None, email=None,
            website=None, address=None, tags_json="{}",
        )
        defaults.update(kwargs)
        return PlaceRow(**defaults)

    def test_skor_araligi(self):
        assert 0 <= lead_score(self._row()) <= 100
        dolu = self._row(phone="111", email="a@b.com", website="https://x")
        assert 0 <= lead_score(dolu) <= 100

    def test_telefon_skoru_yukseltir(self):
        assert lead_score(self._row(phone="111")) > lead_score(self._row())

    def test_isim_skoru_yukseltir(self):
        assert lead_score(self._row(name="Alfa")) > lead_score(self._row(name=None))

    def test_guven_skoru_etkiler(self):
        yuksek_guven = lead_score(self._row(confidence=90))
        dusuk_guven = lead_score(self._row(confidence=20))
        assert yuksek_guven > dusuk_guven


@pytest.mark.asyncio
class TestCountByType:
    async def test_tur_basina_sayim(self, db):
        counts = await count_by_type(db, D, include_buffer=True)
        assert counts["factory"] == 3
        assert counts["office"] == 1
        assert counts["kindergarten"] == 1

    async def test_on_turun_hepsi_anahtarda(self, db):
        # Arayuz chip'leri bu sozlukten besleniyor; eksik anahtar
        # "sayi yok" ile "sifir" ayrimini bozar.
        counts = await count_by_type(db, D, include_buffer=True)
        assert len(counts) == 10
        assert counts["high_school"] == 0
        assert counts["college_university"] == 0

    async def test_include_buffer_false_sayimi_dusurur(self, db):
        counts = await count_by_type(db, D, include_buffer=False)
        assert counts["kindergarten"] == 0  # osm:node:5 tampon bolgesinde

    async def test_siniflandirilamayan_sayilmaz(self, db):
        counts = await count_by_type(db, D, include_buffer=True)
        assert sum(counts.values()) == 5
