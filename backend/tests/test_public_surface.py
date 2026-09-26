"""
Backend adresi internete acik: anahtarsiz ulasilan uclar yalniz gerekenler
olmali ve hicbiri disariya istek atmamali ya da ic yapiyi anlatmamali.
"""

from unittest.mock import patch

ADMIN = {"X-ADMIN-KEY": "test-admin-key"}


def test_dokumantasyon_canlida_kapali(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_eski_statik_panel_yok(client):
    assert client.get("/admin/ui/admin.html").status_code == 404


def test_metrikler_yalniz_yonetici(client):
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers=ADMIN).status_code == 200


def test_hazirlik_kontrolu_disariya_istek_atmaz(client):
    with patch("app.overpass.overpass_client.query", side_effect=AssertionError("Overpass cagrilmamali")):
        response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json()["checks"]["database"]["status"] == "pass"


def test_yonetici_anahtari_yanlissa_401(client):
    assert client.get("/admin/stats", headers={"X-ADMIN-KEY": "yanlis"}).status_code == 401


def test_istek_siniri_asilinca_429(client):
    from app.limits import limiter

    limiter.enabled = True
    limiter.reset()
    try:
        codes = [client.get("/health/ready").status_code for _ in range(21)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:20] == [200] * 20
    assert codes[20] == 429
