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
# Testler ayni "istemciden" yuzlerce istek atiyor; sinir ayrica test ediliyor.
os.environ["RATE_LIMIT_ENABLED"] = "false"
# Gelistiricinin .env'indeki LOCAL_MODE=true testlere sizmasin; yerel
# mod testleri bayragi kendileri aciyor.
os.environ["LOCAL_MODE"] = "false"
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
    """
    Kota ve plan kisitina takilmayan bir test anahtari.

    `id` bilerek veriliyor. Uretimde kimligi dogrulanmis her anahtar
    veritabanindan gelir ve bir id'si vardir; kayitli yerler sahipligi
    (`saved_places.api_key_id`) bu id uzerinden kuruluyor. Id'siz bir
    cift, gercekte olmayan bir durumu taklit edip NOT NULL ihlaline
    dusuyordu.

    Satir api_keys tablosunda da var (bkz. _test_api_key_row): Postgres
    yabanci anahtari uyguluyor; SQLite uygulamadigi icin bu eksiklik
    yillarca gorunmedi ve testler ancak baska bir test tesadufen id=1
    anahtar yarattiginda geciyordu.
    """
    return APIKey(
        id=1,
        name="test",
        key_hash="test-hash",
        daily_limit=10_000,
        used_today=0,
        plan="pro",
        is_active=True,
        last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
    )


@pytest.fixture(scope="session", autouse=True)
def _test_api_key_row():
    """
    Sahte test anahtarinin (id=1) satirini bir kez yazar.

    Ayri bir motorla ve asyncio.run ile: uygulamanin motoru testlerin
    olay dongulerine bagli, oturum basinda ona dokunmak dongu karistirir.
    """
    import asyncio

    from sqlalchemy import select, text

    from app.database import DB_URL, Base, make_engine

    async def ensure():
        engine = make_engine(DB_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            exists = await conn.scalar(select(APIKey.id).where(APIKey.id == 1))
            if not exists:
                await conn.execute(
                    APIKey.__table__.insert().values(
                        id=1, name="test", key_hash="test-hash", daily_limit=10_000,
                        used_today=0, plan="pro", is_active=True,
                        last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                )
            if conn.dialect.name == "postgresql":
                # Elle verilen id seriyi ilerletmiyor; sonraki gercek anahtar
                # (admin ucu) yine 1'i alip cakisirdi.
                await conn.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence('api_keys', 'id'),"
                        " (SELECT MAX(id) FROM api_keys))"
                    )
                )
        await engine.dispose()

    asyncio.run(ensure())


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
