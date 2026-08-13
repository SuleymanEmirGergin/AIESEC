"""
LOCAL_MODE: yerel kullanimda kota/plan katmanini baypas eder.

conftest.py auth'u override ettigi icin bu testler override'i
kaldirip gercek dependency'yi calistiriyor.

`test_kota_sayaci_artmiyor` ve `test_validate_api_key_sanal_anahtar_donduruyor`
TestClient/HTTP katmanini hic kullanmiyor - verify_api_key/validate_api_key
dogrudan cagriliyor. Sebep: conftest'in autouse override'i sadece
app.dependency_overrides uzerinden, yani gercek bir istek FastAPI
yonlendirmesinden gectiginde devreye giriyor. `/api/districts` gibi auth
gerektirmeyen bir uca TestClient ile gitmek LOCAL_API_KEY'e hic dokunmaz;
used_today'in degismemesi o zaman hicbir sey kanitlamaz. Fonksiyonu
dogrudan cagirmak override'in var olup olmamasindan bagimsiz, gercek kod
yolunu calistirir.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth import validate_api_key, verify_api_key
from app.config import settings
from app.main import app


@pytest.fixture
def gercek_auth():
    """conftest'in auth override'ini gecici olarak kaldirir."""
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.pop(verify_api_key, None)
    app.dependency_overrides.pop(validate_api_key, None)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


@pytest.fixture
def local_mode(monkeypatch):
    monkeypatch.setattr(settings, "local_mode", True)
    yield


@pytest.fixture
def uzak_mode(monkeypatch):
    monkeypatch.setattr(settings, "local_mode", False)
    yield


class TestLocalModeAcik:
    def test_anahtarsiz_arama_calisir(self, gercek_auth, local_mode):
        with TestClient(app) as client:
            response = client.get(
                "/api/search", params={"lat": 41.0, "lon": 29.0, "type": "factory"}
            )
        # 401 OLMAMALI. Overpass erisilemezse 503 kabul.
        assert response.status_code != 401

    def test_sanal_anahtar_enterprise_plan(self, local_mode):
        from app.auth import LOCAL_API_KEY

        assert LOCAL_API_KEY.plan == "enterprise"
        assert LOCAL_API_KEY.is_active is True
        # Kota sayaci islemiyor; sinir pratikte sonsuz.
        assert LOCAL_API_KEY.daily_limit >= 10**9

    async def test_kota_sayaci_artmiyor(self, local_mode):
        """
        verify_api_key'i dogrudan cagirir (bkz. dosya basindaki not).

        db=None geciliyor: local_mode acikken erken donus db'ye hic
        dokunmamali. Eger kod yanlislikla erken donusu atlayip
        _get_api_key_obj'a duserse db=None hemen AttributeError ile
        patlar - bu da sessiz bir yanlis pozitif yerine acik bir
        test hatasi verir.
        """
        from app.auth import LOCAL_API_KEY

        before = LOCAL_API_KEY.used_today
        result = await verify_api_key(x_api_key=None, db=None)

        assert result is LOCAL_API_KEY
        assert LOCAL_API_KEY.used_today == before

    async def test_validate_api_key_sanal_anahtar_donduruyor(self, local_mode):
        """Ikinci gate: validate_api_key de ayni sanal anahtari dondurmeli."""
        from app.auth import LOCAL_API_KEY

        result = await validate_api_key(x_api_key=None, db=None)
        assert result is LOCAL_API_KEY


class TestLocalModeKapali:
    def test_anahtarsiz_istek_401(self, gercek_auth, uzak_mode):
        with TestClient(app) as client:
            response = client.get(
                "/api/search", params={"lat": 41.0, "lon": 29.0, "type": "factory"}
            )
        assert response.status_code == 401

    def test_varsayilan_kapali(self):
        # Uretim davranisi degismemeli: bayrak acikca acilmadikca
        # mevcut kimlik dogrulamasi gecerli.
        from app.config import Settings

        assert Settings().local_mode is False
