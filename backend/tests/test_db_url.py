"""Neon/Vercel'in verdigi adres asyncpg ile dogrudan acilamiyor; make_engine ceviriyor."""

from app.database import make_engine


def test_neon_adresi_asyncpg_ve_ssl_ile_acilir():
    engine = make_engine(
        "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    assert engine.url.drivername == "postgresql+asyncpg"
    # asyncpg bu parametreleri tanimiyor; kalsalardi baglanti hata verirdi.
    assert "sslmode" not in engine.url.query
    assert "channel_binding" not in engine.url.query


def test_ssl_bayragi_sslmode_ile_gelir():
    import app.database as database

    seen = {}
    real = database.create_async_engine

    def spy(url, **kwargs):
        seen.update(kwargs.get("connect_args", {}))
        return real(url, **kwargs)

    database.create_async_engine = spy
    try:
        make_engine("postgres://u:p@h/db?sslmode=require")
        assert seen["ssl"] == "require"
        seen.clear()
        make_engine("postgresql://u:p@localhost/db")
        assert "ssl" not in seen
    finally:
        database.create_async_engine = real


def test_sqlite_dokunulmadan_gecer():
    assert make_engine("sqlite+aiosqlite:///./x.db").url.drivername == "sqlite+aiosqlite"
