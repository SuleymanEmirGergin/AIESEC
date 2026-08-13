"""
Ortak test kurulumu.

Testler eskiden `app.routers.search.fetch_overpass` fonksiyonunu
mock'luyordu; o fonksiyon artik yok, arama `search_service` uzerinden
`overpass_client.query` cagiriyor. Ayrica arama ucu artik X-API-KEY
zorunlu tutuyor. Bu dosya iki degisikligi de tek yerde karsiliyor.
"""

import os

# app.database DB_URL'i import aninda okuyor; asagidaki importlardan
# once ayarlanmali. Testler gercek storage.db'ye dokunmamali.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_storage.db")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")
# Ingest artik startup'ta calismiyor (app/ingest.py elle tetikleniyor),
# bu yuzden eski WARMUP_ENABLED bayragina gerek kalmadi.

from datetime import datetime, timezone  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import validate_api_key, verify_api_key  # noqa: E402
from app.cache import cache  # noqa: E402
from app.database import APIKey  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def api_key():
    """Kota ve plan kisitina takilmayan bir test anahtari."""
    return APIKey(
        name="test",
        key_hash="test-hash",
        daily_limit=10_000,
        used_today=0,
        plan="pro",
        is_active=True,
        last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
    )


@pytest.fixture(autouse=True)
def override_auth(api_key):
    """
    Kimlik dogrulamasini devre disi birak.

    Testlerin konusu auth degil; gercek anahtar uretmek her testte
    veritabani yazmayi gerektirirdi. Auth'un kendisi ayrica
    test ediliyor (bkz. test_api.py::TestAuthentication).
    """
    app.dependency_overrides[verify_api_key] = lambda: api_key
    app.dependency_overrides[validate_api_key] = lambda: api_key
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    """
    Context manager olarak kullaniliyor ki startup olayi (init_db)
    calissin; arama ucu override/GlobalState icin veritabanina gidiyor.
    """
    with TestClient(app) as test_client:
        yield test_client


def overpass_stub(stage1_elements, stage2_elements=None):
    """
    overpass_client.query yerine gecen sahte fonksiyon.

    Arama iki asamali: stage 1 isimli kayitlari, stage 2 isimsizleri
    getiriyor. Ikisini ayirt etmek icin sorgudaki [!"name"] filtresine
    bakiliyor; boylece ayni elemanlar iki kez donup sonuclari
    kirletmiyor.
    """

    async def _query(query_text: str, debug: bool = False):
        is_unnamed_stage = '[!"name"]' in query_text
        elements = (stage2_elements or []) if is_unnamed_stage else stage1_elements
        return {"elements": list(elements)}

    return _query
