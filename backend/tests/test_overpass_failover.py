"""
Overpass ayna secimi ve devre kesici.

Gercek olay: bu agdan aynalardan yalnizca biri erisilebilir durumdaydi,
digerleri TCP seviyesinde reddediyordu. Ilk buyuk sorgu calisan aynada
zaman asimina ugrayinca devre kesici onu 60 sn banka gonderdi; sonraki
her deneme "saglikli" gorunen ama aslinda olu aynalara dustu ve ingest
kalici olarak 500 dondu. Yani devre kesici tek calisan aynayi en az
tercih edilen hale getiriyordu.

Buradaki testler o davranisi kilitliyor:
- bir kez basarisiz olan iyi ayna uzun sure banklanmamali,
- hic basarili olmamis ayna tekrar tekrar basarisiz olunca hizla
  yoldan cekilmeli,
- tek sorgunun denemeleri ayni aynayi tekrar tekrar denememeli,
- hepsi banktayken istemci kilitlenmemeli,
- bizim sorgu hatamiz (permanent) aynayi cezalandirmamali.

Zaman kontrollu: metotlar `now` aliyor, boylece gercek beklemeye gerek
kalmadan cooldown penceresi ilerletilebiliyor.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import httpx
import pytest

from app.overpass import (
    OverpassClient,
    OverpassEndpoint,
    OverpassPermanentError,
)

GOOD = "https://good.example/api/interpreter"
DEAD1 = "https://dead1.example/api/interpreter"
DEAD2 = "https://dead2.example/api/interpreter"
DEAD3 = "https://dead3.example/api/interpreter"

T0 = datetime(2026, 8, 14, 12, 0, 0)


def make_client(urls, monkeypatch) -> OverpassClient:
    monkeypatch.setenv("OVERPASS_URLS", ",".join(urls))
    monkeypatch.setenv("OVERPASS_TIMEOUT", "5")
    return OverpassClient()


class TestEndpointCooldown:
    def test_ilk_basarisizlik_kisa_banklar(self):
        """
        Tek bir zaman asimi aynayi dakikalarca yoldan cikarmamali:
        ingest'in bir sonraki sorgusu (saniyeler sonra) onu yeniden
        deneyebilmeli. Eski davranis sabit 60 sn idi ve hatanin
        merkeziydi.
        """
        ep = OverpassEndpoint(GOOD)
        ep.mark_failure(now=T0)

        assert not ep.is_healthy(now=T0)
        assert ep.is_healthy(now=T0 + timedelta(seconds=16)), (
            "tek basarisizlik sonrasi bank suresi 15 sn'yi asmamali"
        )

    def test_ust_uste_basarisizlik_katlanarak_uzar(self):
        """Hic calismayan ayna hizla yoldan cekilmeli."""
        ep = OverpassEndpoint(DEAD1)
        ep.mark_failure(now=T0)
        first = ep.cooldown_until - T0

        ep.mark_failure(now=T0)
        second = ep.cooldown_until - T0
        ep.mark_failure(now=T0)
        third = ep.cooldown_until - T0

        assert second > first < third
        assert third > second

    def test_bank_suresi_tavanla_sinirli(self):
        ep = OverpassEndpoint(DEAD1)
        for _ in range(40):
            ep.mark_failure(now=T0)
        assert (ep.cooldown_until - T0) <= timedelta(seconds=300)

    def test_basari_seriyi_sifirlar(self):
        """
        Ara sira takilan ama genelde calisan ayna, gecmis hatalari
        yuzunden giderek daha uzun banklanmamali.
        """
        ep = OverpassEndpoint(GOOD)
        for _ in range(5):
            ep.mark_failure(now=T0)
        ep.mark_success(now=T0)

        assert ep.is_healthy(now=T0)
        assert ep.last_success == T0

        ep.mark_failure(now=T0)
        assert (ep.cooldown_until - T0) <= timedelta(seconds=15), (
            "basaridan sonraki ilk hata yeniden en kisa banktan baslamali"
        )


class TestEndpointSelection:
    def test_banklanmis_iyi_ayna_yerine_olu_ayna_secilmez(self, monkeypatch):
        """
        Hatanin tam kalbi. Iyi ayna kisa sureligine banktayken olu
        aynalar "hic denenmedigi icin saglikli" gorunuyordu ve secim
        onlara gidiyordu. Olu aynalar bir kez basarisiz olduktan sonra
        secim, banki dolan iyi aynaya donmeli.
        """
        client = make_client([GOOD, DEAD1, DEAD2], monkeypatch)
        good, dead1, dead2 = client.endpoints

        good.mark_success(now=T0)
        good.mark_failure(now=T0)
        dead1.mark_failure(now=T0)
        dead2.mark_failure(now=T0)

        later = T0 + timedelta(seconds=20)
        assert client._select_endpoint(set(), now=later) is good

    def test_gecmiste_basarili_olan_ayna_tercih_edilir(self, monkeypatch):
        client = make_client([DEAD1, GOOD], monkeypatch)
        dead1, good = client.endpoints

        good.mark_success(now=T0)

        assert client._select_endpoint(set(), now=T0) is good, (
            "hepsi saglikliyken daha once calistigi bilinen ayna once gelmeli"
        )

    def test_esit_kanitta_denenmemis_ayna_one_gecer(self, monkeypatch):
        """
        Hicbirinin gecmisi yokken denemeler farkli aynalara dagilmali.
        Bu bir DISLAMA degil siralama: asagidaki test, tek calisan ayna
        varsa onun tekrar denendigini gosteriyor.
        """
        client = make_client([GOOD, DEAD1], monkeypatch)
        first = client._select_endpoint(set(), now=T0)
        second = client._select_endpoint({first.url}, now=T0)

        assert second.url != first.url

    def test_kanitli_ayna_banktayken_bile_olu_aynaya_tercih_edilir(self, monkeypatch):
        """
        Uretimde ikinci ingest'i 500'e dusuren senaryo.

        Iyi ayna bir kez takilip kisa sureligine banklaniyor; olu
        aynalarin banki ise coktan dolmus oluyor ve "saglikli"
        gorunuyorlar. Saglik kanitin onune gecerse istekler hic cevap
        vermeyen sunuculara dagiliyor. Kanit once gelmeli.
        """
        client = make_client([GOOD, DEAD1, DEAD2], monkeypatch)
        good, dead1, dead2 = client.endpoints

        good.mark_success(now=T0)
        good.mark_failure(now=T0)  # bankta: T0+15
        dead1.mark_failure(now=T0 - timedelta(seconds=600))  # banki dolmus
        dead2.mark_failure(now=T0 - timedelta(seconds=600))

        assert client._select_endpoint(set(), now=T0) is good

    def test_ilk_deneme_sonrasi_kesfe_gecilir(self, monkeypatch):
        """
        Kanitli ayna her sorgunun ILK denemesini alir, ama denemelerin
        tamamini degil.

        Olculdu: kanitli ayna 504 donerken ona yapismak tek bir ingest
        sorgusunu 325 sn'ye cikardi ve hicbir alternatif denenmedi.
        Ilk deneme en iyi adaya, kalanlar kesfe gidiyor.
        """
        client = make_client([GOOD, DEAD1, DEAD2], monkeypatch)
        good = client.endpoints[0]
        good.mark_success(now=T0)

        assert client._select_endpoint(set(), now=T0) is good
        assert client._select_endpoint({GOOD}, now=T0) is not good

    def test_tek_ayna_varsa_yeniden_denenir(self, monkeypatch):
        """Alternatif yokken denenmis olmak diskalifiye etmemeli."""
        client = make_client([GOOD], monkeypatch)
        assert client._select_endpoint({GOOD}, now=T0) is client.endpoints[0]

    def test_kanit_suresiz_degil(self, monkeypatch):
        """
        Kalici olarak olen eski-iyi bir ayna, saglam yeni bir aynayi
        sonsuza dek bloklamamali.
        """
        client = make_client([GOOD, DEAD1], monkeypatch)
        good, other = client.endpoints
        good.mark_success(now=T0)

        for _ in range(3):
            good.mark_failure(now=T0)

        assert not good.is_proven()
        assert client._select_endpoint(set(), now=T0) is other


class TestQueryFailover:
    @pytest.mark.asyncio
    async def test_olu_aynalari_gecip_calisan_aynayi_bulur(self, monkeypatch):
        """
        Uctan uca: ilk iki ayna baglanti hatasi veriyor, ucuncusu
        calisiyor. Sorgu basarili donmeli ve calisan ayna basarili
        olarak isaretlenmeli.
        """
        client = make_client([DEAD1, DEAD2, GOOD], monkeypatch)

        async def fake_post(self, url, **kwargs):
            if url == GOOD:
                return httpx.Response(
                    200, json={"elements": []}, request=httpx.Request("POST", url)
                )
            raise httpx.ConnectError("baglanti reddedildi")

        with patch.object(httpx.AsyncClient, "post", new=fake_post):
            result = await client.query("[out:json];out count;")

        assert result == {"elements": []}
        good = next(ep for ep in client.endpoints if ep.url == GOOD)
        assert good.last_success is not None
        assert good.fail_streak == 0

    @pytest.mark.asyncio
    async def test_bizim_sorgu_hatamiz_aynayi_cezalandirmaz(self, monkeypatch):
        """
        Overpass sorgu metnimize itiraz ediyorsa sucu aynada degil.
        Eski kod genis `except Exception` icinde mark_failure cagirdigi
        icin bozuk bir sorgu tum aynalari sirayla banka gonderiyordu.
        """
        client = make_client([GOOD, DEAD1], monkeypatch)

        async def fake_post(self, url, **kwargs):
            return httpx.Response(
                200,
                json={"remark": "syntax error near 'oot'"},
                request=httpx.Request("POST", url),
            )

        with patch.object(httpx.AsyncClient, "post", new=fake_post):
            with pytest.raises(OverpassPermanentError):
                await client.query("bozuk sorgu")

        for ep in client.endpoints:
            assert ep.cooldown_until is None, (
                f"{ep.url} bizim sorgu hatamiz yuzunden banklanmis"
            )
            assert ep.fail_streak == 0

    @pytest.mark.asyncio
    async def test_ardisik_sorguda_takilan_iyi_ayna_terk_edilmez(self, monkeypatch):
        """
        Uretim regresyonu, uctan uca.

        Birinci ingest basarili -> iyi ayna kanitli, olu aynalar
        banklanmis. Ikinci ingest'te iyi ayna bir kez takiliyor. Olu
        aynalarin banki bu arada dolmus oluyor; eski davranista istekler
        onlara dagilip ConnectError ile 500 donuyordu. Dogru davranis:
        iyi aynayi birakmamak.
        """
        client = make_client([GOOD, DEAD1, DEAD2], monkeypatch)
        good = client.endpoints[0]

        good.mark_success(now=datetime.now())
        good.mark_failure(now=datetime.now())
        for dead in client.endpoints[1:]:
            dead.mark_failure(now=datetime.now() - timedelta(seconds=600))

        seen = []

        async def fake_post(self, url, **kwargs):
            seen.append(url)
            if url == GOOD:
                return httpx.Response(
                    200, json={"elements": []}, request=httpx.Request("POST", url)
                )
            raise httpx.ConnectError("baglanti reddedildi")

        with patch.object(httpx.AsyncClient, "post", new=fake_post):
            result = await client.query("[out:json];out count;")

        assert result == {"elements": []}
        assert seen[0] == GOOD, f"ilk deneme olu aynaya gitti: {seen}"

    @pytest.mark.asyncio
    async def test_denemeler_farkli_aynalara_dagilir(self, monkeypatch):
        """
        Hepsi basarisiz olsa bile denemeler ayni aynayi tekrarlamamali;
        elimizde birden fazla ayna varken dogru hamle beklemek degil
        digerine gecmek.
        """
        client = make_client([DEAD1, DEAD2, DEAD3], monkeypatch)
        seen = []

        async def fake_post(self, url, **kwargs):
            seen.append(url)
            raise httpx.ConnectError("baglanti reddedildi")

        with patch.object(httpx.AsyncClient, "post", new=fake_post):
            with pytest.raises(httpx.ConnectError):
                await client.query("[out:json];out count;")

        assert len(seen) == len(set(seen)), f"ayni ayna tekrar denendi: {seen}"
