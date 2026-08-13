"""
Anahtar yonetimi: plan yukseltme ve listeleme.

Onceden plan yalnizca anahtar uretilirken belirlenebiliyordu. Mevcut bir
hesabi Pro'ya cikarmanin tek yolu ya yeni anahtar uretmek (eskisini
kullanan herkesi disarida birakir) ya da SQLite dosyasina elle mudahale
etmekti. Bu testler yukseltmenin anahtari degistirmeden calistigini
sabitliyor.
"""

ADMIN_HEADERS = {"X-ADMIN-KEY": "test-admin-key"}


def _create_key(client, name: str, plan: str = "free", daily_limit: int = 50):
    response = client.post(
        f"/admin/keys?name={name}&plan={plan}&daily_limit={daily_limit}",
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _find_key(client, name: str) -> dict:
    listing = client.get("/admin/keys", headers=ADMIN_HEADERS)
    assert listing.status_code == 200, listing.text
    matches = [k for k in listing.json() if k["name"] == name]
    assert matches, f"'{name}' listede yok"
    return matches[-1]


class TestKeyListing:
    def test_listing_never_returns_the_plain_key(self, client):
        """
        Duz anahtar yalnizca uretim aninda donuyor. Listede yeniden
        gorunmesi, veritabanina erisen herkesin tum anahtarlari ele
        gecirmesi demek olurdu.
        """
        created = _create_key(client, "listeleme_testi")
        assert "key" in created, "uretim aninda duz anahtar donmeli"

        row = _find_key(client, "listeleme_testi")
        assert "key" not in row, "listede duz anahtar donmemeli"
        assert "key_hash" not in row, "ozet de disari acilmamali"
        assert row["plan"] == "free"

    def test_listing_exposes_id_for_addressing(self, client):
        """
        Guncelleme id ile adresleniyor; ad benzersiz degil.

        Not: test veritabani (test_storage.db) calistirmalar arasinda
        silinmiyor, dolayisiyla kesin satir sayisi uzerinden dogrulama
        yapilmiyor - onceki kosudan kalan kayitlar sayimi bozar. Iddia
        sayiya degil ozellige bakiyor: ayni adli anahtarlarin id'leri
        birbirinden farkli olmali.
        """
        _create_key(client, "ayni_ad")
        _create_key(client, "ayni_ad")

        listing = client.get("/admin/keys", headers=ADMIN_HEADERS).json()
        ids = [k["id"] for k in listing if k["name"] == "ayni_ad"]
        assert len(ids) >= 2, "ayni adla iki anahtar uretilebilmeli"
        assert len(set(ids)) == len(ids), "ayni adli anahtarlar ayri id almali"


class TestPlanUpgrade:
    def test_upgrade_to_pro_keeps_the_same_key(self, client):
        """
        Plan degisikligi anahtarin kendisine dokunmamali: kullanicinin
        tarayicisindaki ya da SEARCH_API_KEY'deki deger gecerli kalmali.
        """
        created = _create_key(client, "yukseltme_testi", plan="free")
        row = _find_key(client, "yukseltme_testi")

        response = client.patch(
            f"/admin/keys/{row['id']}",
            json={"plan": "pro"},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 200, response.text
        assert response.json()["plan"] == "pro"

        # Anahtarin kendisi degismedi; ad ve kota korundu.
        after = _find_key(client, "yukseltme_testi")
        assert after["plan"] == "pro"
        assert after["daily_limit"] == created["daily_limit"]
        assert after["id"] == row["id"]

    def test_partial_update_leaves_other_fields_alone(self, client):
        """Yalnizca gonderilen alan degismeli."""
        _create_key(client, "kismi_guncelleme", plan="free", daily_limit=42)
        row = _find_key(client, "kismi_guncelleme")

        client.patch(
            f"/admin/keys/{row['id']}",
            json={"daily_limit": 900},
            headers=ADMIN_HEADERS,
        )

        after = _find_key(client, "kismi_guncelleme")
        assert after["daily_limit"] == 900
        assert after["plan"] == "free", "plan gonderilmedi, degismemeliydi"

    def test_unknown_plan_is_rejected(self, client):
        """Serbest metin plan kabul edilmemeli; yetki kontrolleri buna bakiyor."""
        _create_key(client, "gecersiz_plan")
        row = _find_key(client, "gecersiz_plan")

        response = client.patch(
            f"/admin/keys/{row['id']}",
            json={"plan": "platinum"},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 422

    def test_missing_key_returns_404(self, client):
        response = client.patch(
            "/admin/keys/999999", json={"plan": "pro"}, headers=ADMIN_HEADERS
        )
        assert response.status_code == 404

    def test_requires_admin_key(self, client):
        """Yetkisiz cagri plani degistirememeli."""
        _create_key(client, "yetki_testi")
        row = _find_key(client, "yetki_testi")

        response = client.patch(f"/admin/keys/{row['id']}", json={"plan": "pro"})
        assert response.status_code == 401

        assert _find_key(client, "yetki_testi")["plan"] == "free"
