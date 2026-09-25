"""
Overture zenginlestirmesi.

En kritik test `test_mevcut_uyelikler_silinmiyor`: ilk yazimda
replace_memberships kullanilmisti ve o fonksiyon ilcenin TUM uyelik
satirlarini siliyor -- Overture yolundan cagrilsaydi ilcedeki butun OSM
kayitlari sorgudan dusordu. Sessiz ve buyuk bir veri kaybi olurdu,
cunku kayitlar tabloda durmaya devam eder ama hicbir ilceye ait
gorunmezdi.

Digerleri eslestirme ve sinir davranisini kilitliyor.
"""

from unittest.mock import patch

import pytest
from sqlalchemy import text

from app.database import AsyncSessionLocal, init_db
from app.overture_ingest import (
    _looks_same,
    absorb_overture_duplicates,
    ingest_overture_district,
)
from app.store import add_memberships, replace_memberships, upsert_places

DISTRICT = "tr-22-edirne-merkez"
# Edirne Merkez sinirlari icinde bir nokta.
LAT, LON = 41.6771, 26.5557


class TestIsimEslestirme:
    def test_ayni_isim_eslesir(self):
        assert _looks_same("Şirinevler İlkokulu", "Şirinevler İlkokulu")

    def test_icerme_eslesir(self):
        """OSM kisa, Overture uzun yazabiliyor."""
        assert _looks_same("Şirinevler İlkokulu", "Şirinevler İlkokulu Müdürlüğü")

    def test_turkce_katlama(self):
        """tr_fold olmadan 'İ' ile 'i' eslesmezdi."""
        assert _looks_same("İSTİKLAL LİSESİ", "istiklal lisesi")

    def test_turkce_harf_ile_ascii_yazim_eslesir(self):
        """
        Kaynaklardan biri Turkce harfsiz yazabiliyor ("Bakirkoy"). Olcumde
        ilce basina ~10 cift (Hilton Bakırköy, Yalçın Emlak) bu yuzden
        birlesmiyordu.
        """
        assert _looks_same("Hilton Istanbul Bakırköy", "Hilton Istanbul Bakirkoy")
        assert _looks_same("Yalçın Emlak", "Yalcin Emlak")
        assert _looks_same("Türk Telekom", "Turk Telekom")

    def test_farkli_isim_eslesmez(self):
        assert not _looks_same("Atatürk İlkokulu", "Cumhuriyet İlkokulu")

    def test_cok_kisa_isimde_icerme_yok(self):
        """'As' her seyin icinde geciyor; kisa isimde tam esitlik sart."""
        assert not _looks_same("As", "Astoria Fabrikasi")


@pytest.mark.asyncio
class TestZenginlestirme:
    async def _osm_kaydi(self, db, pid: str, name: str, **kw):
        await upsert_places(
            db,
            [
                {
                    "id": pid,
                    "lat": LAT,
                    "lon": LON,
                    "name": name,
                    "place_type": "primary_school",
                    "subtype": None,
                    "confidence": 80,
                    "has_contact": False,
                    "phone": kw.get("phone"),
                    "email": None,
                    "website": None,
                    "address": None,
                    "tags_json": "{}",
                }
            ],
        )

    async def test_mevcut_uyelikler_silinmiyor(self):
        """
        Overture ingest'i OSM kayitlarinin ilce uyeligini korumali.

        Regresyon: replace_memberships kullanilsaydi bu sayi 0 olurdu.
        """
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._osm_kaydi(db, "osm:node:9990001", "Test OSM Okulu")
            await replace_memberships(db, DISTRICT, [("osm:node:9990001", True)])

            before = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM place_districts WHERE district_id=:d AND place_id LIKE 'osm:%'"
                    ),
                    {"d": DISTRICT},
                )
            ).scalar()

            with patch(
                "app.overture_ingest.fetch_places",
                return_value=[
                    {
                        "id": "ov-1",
                        "name": "Bambaska Bir Fabrika",
                        "category": "factory",
                        "place_type": "factory",
                        "lat": LAT,
                        "lon": LON,
                        "confidence": 90,
                        "phone": "+902841112233",
                        "website": None,
                        "email": None,
                        "address": "Merkez",
                    }
                ],
            ):
                await ingest_overture_district(db, DISTRICT)

            after = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM place_districts WHERE district_id=:d AND place_id LIKE 'osm:%'"
                    ),
                    {"d": DISTRICT},
                )
            ).scalar()

        assert after == before, "Overture ingest'i OSM uyeliklerini sildi"

    async def test_uyeligi_olmayan_osm_kaydi_yine_eslesir(self):
        """
        Eslestirme place_districts join'ine bagliydi. Basarisiz bir OSM
        cekimi ilcenin uyeligini silince (yasandi: 48 ilce) `existing`
        bos geliyor ve ayni kurum Overture'dan ikinci kez ekleniyordu
        (Fatih'te 326 cift). Uyelik turetilmis durum; eslestirme
        koordinata bakmali.
        """
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._osm_kaydi(db, "osm:node:9990004", "Uyeliksiz Okul")
            # Bilerek uyelik YAZILMIYOR.
            with patch(
                "app.overture_ingest.fetch_places",
                return_value=[
                    {
                        "id": "ov-4",
                        "name": "Uyeliksiz Okul",
                        "category": "elementary_school",
                        "place_type": "primary_school",
                        "lat": LAT,
                        "lon": LON,
                        "confidence": 90,
                        "phone": "+902841234567",
                        "website": None,
                        "email": None,
                        "address": None,
                    }
                ],
            ):
                result = await ingest_overture_district(db, DISTRICT)

            n_ov = (
                await db.execute(text("SELECT COUNT(*) FROM places WHERE id='overture:ov-4'"))
            ).scalar()
            phone = (
                await db.execute(text("SELECT phone FROM places WHERE id='osm:node:9990004'"))
            ).scalar()

        assert n_ov == 0, "ayni kurum ikinci kez eklendi"
        assert phone == "+902841234567", "mevcut kayit zenginlestirilmedi"
        assert result.enriched == 1 and result.inserted == 0

    async def test_bos_alan_dolduruluyor_dolu_alan_korunuyor(self):
        """
        Yerel katki uzak kaynakla EZILMEMELI: gonullunun elle duzelttigi
        bir numarayi sessizce geri almak en kotu davranis olurdu.
        """
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._osm_kaydi(
                db, "osm:node:9990002", "Ayni Isimli Okul", phone="+900000000000"
            )
            await replace_memberships(db, DISTRICT, [("osm:node:9990002", True)])

            with patch(
                "app.overture_ingest.fetch_places",
                return_value=[
                    {
                        "id": "ov-2",
                        "name": "Ayni Isimli Okul",
                        "category": "elementary_school",
                        "place_type": "primary_school",
                        "lat": LAT,
                        "lon": LON,
                        "confidence": 90,
                        "phone": "+902849998877",
                        "website": "https://ornek.tr",
                        "email": None,
                        "address": None,
                    }
                ],
            ):
                await ingest_overture_district(db, DISTRICT)

            row = (
                await db.execute(
                    text(
                        "SELECT phone, website FROM places WHERE id='osm:node:9990002'"
                    )
                )
            ).one()

        assert row[0] == "+900000000000", "mevcut telefon ezildi"
        assert row[1] == "https://ornek.tr", "bos website doldurulmadi"

    async def test_ilce_disi_kayit_alinmiyor(self):
        """
        Bbox dikdortgen ve Edirne'de Yunanistan'i iceriyor. Poligon
        suzmesi olmasa sinir otesi kayitlar ilceye yazilirdi -- ilk
        olcumde +30 numarali Yunan okullari gelmisti.
        """
        await init_db()
        async with AsyncSessionLocal() as db:
            with patch(
                "app.overture_ingest.fetch_places",
                return_value=[
                    {
                        "id": "ov-yunanistan",
                        "name": "Dimotiko Scholeio",
                        "category": "elementary_school",
                        "place_type": "primary_school",
                        # Yunanistan tarafi
                        "lat": 41.50,
                        "lon": 26.10,
                        "confidence": 90,
                        "phone": "+302552093293",
                        "website": None,
                        "email": None,
                        "address": None,
                    }
                ],
            ):
                result = await ingest_overture_district(db, DISTRICT)

            leaked = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM places WHERE id='overture:ov-yunanistan'"
                    )
                )
            ).scalar()

        assert result.inserted == 0
        assert leaked == 0


# OSM ingest'in Overture'la birlesmesi. Enrich OSM'den SONRA calisinca
# eslestirmeyi o yapiyor; ama OSM bir ilceye Overture'dan SONRA gelirse
# (kismi cekimi tekrar denemek gibi) ayni kurum iki kez yaziliyordu.
BBOX = (LAT - 0.01, LON - 0.01, LAT + 0.01, LON + 0.01)


def _osm_satiri(pid: str, name: str | None, lat: float = LAT, **kw) -> dict:
    return {
        "id": pid,
        "lat": lat,
        "lon": LON,
        "name": name,
        "place_type": kw.get("place_type", "primary_school"),
        "subtype": None,
        "confidence": 70,
        "has_contact": bool(kw.get("phone")),
        "phone": kw.get("phone"),
        "email": None,
        "website": None,
        "address": None,
        "tags_json": "{}",
    }


@pytest.mark.asyncio
class TestOsmOvertureBirlestirme:
    async def _overture_kaydi(self, db, oid: str, name: str, **kw):
        await upsert_places(
            db,
            [
                {
                    **_osm_satiri(oid, name, place_type=kw.get("place_type", "primary_school")),
                    "phone": kw.get("phone"),
                    "website": kw.get("website"),
                    "has_contact": bool(kw.get("phone") or kw.get("website")),
                    "source": "overture",
                }
            ],
        )
        await add_memberships(db, DISTRICT, [(oid, True)])
        await db.commit()

    async def _say(self, db, sql: str) -> int:
        return (await db.execute(text(sql))).scalar()

    async def test_eslesen_overture_kaydi_osm_ye_katilir(self):
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._overture_kaydi(
                db, "overture:bir-1", "Birlesme Ilkokulu",
                phone="+902841110000", website="https://birlesme.k12.tr",
            )

            rows, absorbed = await absorb_overture_duplicates(
                db, [_osm_satiri("osm:node:9991001", "Birlesme İlkokulu")], BBOX
            )

            kalan = await self._say(db, "SELECT COUNT(*) FROM places WHERE id='overture:bir-1'")
            uyelik = await self._say(
                db, "SELECT COUNT(*) FROM place_districts WHERE place_id='overture:bir-1'"
            )

        assert absorbed == 1
        assert kalan == 0 and uyelik == 0, "Overture cifti silinmedi"
        assert rows[0]["phone"] == "+902841110000"
        assert rows[0]["website"] == "https://birlesme.k12.tr"
        assert rows[0]["has_contact"] is True

    async def test_osm_deki_dolu_alan_ezilmez(self):
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._overture_kaydi(db, "overture:bir-2", "Ezilmez Lisesi", phone="+902842220000")
            original = _osm_satiri("osm:node:9991002", "Ezilmez Lisesi", phone="+900000000001")

            rows, _ = await absorb_overture_duplicates(db, [original], BBOX)

        assert rows[0]["phone"] == "+900000000001"
        assert original["phone"] == "+900000000001", "girdi satiri yerinde degistirildi"

    async def test_farkli_isim_ya_da_uzak_kayit_katilmaz(self):
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._overture_kaydi(db, "overture:bir-3", "Cumhuriyet Ortaokulu")

            _, absorbed = await absorb_overture_duplicates(
                db,
                [
                    _osm_satiri("osm:node:9991003", "Ataturk Ortaokulu"),
                    # ~330 m kuzeyde, ayni isim
                    _osm_satiri("osm:node:9991004", "Cumhuriyet Ortaokulu", lat=LAT + 0.003),
                ],
                BBOX,
            )
            kalan = await self._say(db, "SELECT COUNT(*) FROM places WHERE id='overture:bir-3'")
            await db.execute(text("DELETE FROM place_districts WHERE place_id='overture:bir-3'"))
            await db.execute(text("DELETE FROM places WHERE id='overture:bir-3'"))
            await db.commit()

        assert absorbed == 0
        assert kalan == 1

    async def test_kayitli_yer_osm_kaydina_yonlendirilir(self):
        """Arayuz 'kaydedildi' isaretini place_id ile buluyor; silinen id'de kalamaz."""
        await init_db()
        async with AsyncSessionLocal() as db:
            await self._overture_kaydi(db, "overture:bir-5", "Kayitli Anaokulu")
            await db.execute(
                text(
                    "INSERT INTO saved_places (id, api_key_id, place_id, name, lat, lon,"
                    " tags, contact_status) VALUES ('sp-bir-5', 1, 'overture:bir-5',"
                    " 'Kayitli Anaokulu', :lat, :lon, '{}', 'uncontacted')"
                ),
                {"lat": LAT, "lon": LON},
            )
            await db.commit()

            await absorb_overture_duplicates(
                db, [_osm_satiri("osm:node:9991005", "Kayitli Anaokulu")], BBOX
            )
            pid = (
                await db.execute(text("SELECT place_id FROM saved_places WHERE id='sp-bir-5'"))
            ).scalar()
            await db.execute(text("DELETE FROM saved_places WHERE id='sp-bir-5'"))
            await db.commit()

        assert pid == "osm:node:9991005"
