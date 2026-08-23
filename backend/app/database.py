"""Database configuration and SQLAlchemy models."""

import datetime
import os

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DB_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./storage.db")

# Async engine setup
engine = create_async_engine(DB_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""

    pass


class Report(Base):
    """User misclassification reports."""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    place_id = Column(String, index=True)
    shown_type = Column(String)
    correct_type = Column(String)
    lat = Column(Float)
    lon = Column(Float)
    name = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    client = Column(String, nullable=True)
    app_version = Column(String, nullable=True)
    ip = Column(String, nullable=True)

    # Enhanced Fields
    status = Column(String, default="open", index=True)  # open, resolved, ignored
    admin_notes = Column(String, nullable=True)
    tags = Column(JSON, default=list)  # e.g. ["false_positive", "high_priority"]
    applied_override = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)


class Override(Base):
    """Manual classification overrides for specific OSM objects."""

    __tablename__ = "overrides"

    id = Column(String, primary_key=True)  # UUID
    place_id = Column(String, unique=True, index=True)
    forced_type = Column(String)
    forced_subtype = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
    created_by = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, index=True)


class APIKey(Base):
    """API Keys for authenticated access and quota enforcement."""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True)
    key_hash = Column(String, unique=True, index=True)
    name = Column(String)
    is_active = Column(Boolean, default=True)
    daily_limit = Column(Integer, default=500)
    used_today = Column(Integer, default=0)
    last_reset_date = Column(DateTime, default=datetime.datetime.utcnow)
    plan = Column(String, default="free", index=True)  # free, pro, enterprise


class ExportLog(Base):
    """Audit logs for data exports."""

    __tablename__ = "export_logs"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    ip = Column(String)
    client = Column(String, nullable=True)
    type = Column(String)
    radius = Column(Integer)
    center_lat = Column(Float)
    center_lon = Column(Float)
    item_count = Column(Integer)


class PlaceList(Base):
    """
    Gonullulerin olusturdugu adlandirilmis liste ("Kadikoy liseleri").

    Sahiplik API anahtari uzerinden: ayni anahtari kullanan herkes ayni
    listeleri goruyor. Uygulama anahtar girilmediginde sunucunun
    anahtarina dusuyor, dolayisiyla varsayilan davranis "tum ekip ayni
    listeleri paylasir" oluyor - urunun istedigi de bu.
    """

    __tablename__ = "place_lists"

    id = Column(String, primary_key=True)  # uuid
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
    # Kimin olusturdugu listede yaziyor: ekip donusken, devir teslim
    # arayuzun isi (bkz. PRODUCT.md ilke 5).
    created_by = Column(String, nullable=True)


class SavedPlace(Base):
    """
    Kaydedilmis bir yer.

    Yerin kendisi (ad, konum, etiketler) burada kopyalaniyor, yalnizca
    OSM id'si degil. Sebep: kayit, arama onbelleginin ya da ingest
    tablosunun hala o kaydi tutuyor olmasina bagimli olmamali. Gonullu
    "kaydettim" dediginde kaydettigi sey durmali.

    `UniqueConstraint(api_key_id, place_id)`: bir yer takim basina bir kez
    kaydedilir, listeler arasinda tasinir. Ayni okulun iki listede iki
    farkli notla durmasi devir teslimi bozar - hangi not gecerli belli olmaz.
    """

    __tablename__ = "saved_places"

    id = Column(String, primary_key=True)  # uuid
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), index=True, nullable=False)
    # NULL = henuz bir listeye konmamis ("Dosyalanmamis").
    list_id = Column(
        String,
        ForeignKey("place_lists.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    place_id = Column(String, nullable=False, index=True)  # osm:node:123
    name = Column(String, nullable=True)
    place_type = Column(String, nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    address = Column(String, nullable=True)
    tags = Column(JSON, default=dict)

    note = Column(String, nullable=True)
    saved_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("api_key_id", "place_id", name="uq_saved_place_per_key"),
    )


class GlobalState(Base):
    """Global system status like overrides last updated timestamp."""

    __tablename__ = "global_state"

    key = Column(String, primary_key=True)
    value = Column(String)
    updated_at = Column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )


class PlaceRow(Base):
    """
    Ingest edilmis POI. Yerel arama bu tablo uzerinde calisiyor;
    sorgu yolunda Overpass'e hic gidilmiyor.

    place_type NULL olabilir: OSM'de `building=school` tasiyip
    `amenity=school` tasimayan kayitlar siniflandirilamiyor. Veriyi
    atmak yerine saklaniyor, filtrelerde varsayilan olarak gizleniyor
    (include_unclassified ile gorulebilir).
    """

    __tablename__ = "places"

    id = Column(String, primary_key=True)  # osm:node:123
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    name = Column(String, nullable=True)
    place_type = Column(String, nullable=True, index=True)
    subtype = Column(String, nullable=True)
    confidence = Column(Integer, nullable=False, default=0)
    # Turetilmis ve indeksli: filtre panelinin en cok kullanilan kosulu.
    has_contact = Column(Boolean, nullable=False, default=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    address = Column(String, nullable=True)
    tags_json = Column(String, nullable=False, default="{}")
    fetched_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    # Kaydin nereden geldigi: "osm" veya "overture".
    #
    # Iki kaynagin lisansi ve guncelleme dongusu farkli; hangi satirin
    # nereden geldigini bilmeden ne geri alinabilir ne de bir kaynak
    # tek basina yenilenebilir. OSM kayitlari icin varsayilan "osm",
    # boylece mevcut satirlar migration'siz dogru degeri aliyor.
    source = Column(String, nullable=False, default="osm", index=True)


class PlaceDistrict(Base):
    """
    POI - ilce uyeligi (cok-a-cok).

    Neden ayri tablo: 2 km tampon yuzunden sinirdaki bir kayit iki
    ilceye de ait — Kadikoy'un icinde VE Atasehir'in tamponunda.
    places tablosunda tek district_id kolonu olsa ingest sirasi hangisi
    ise o kazanir ve kayit sessizce yanlis ilceye yazilirdi.

    is_inside: True = kesin sinir ici, False = tampon bolgesi.
    """

    __tablename__ = "place_districts"

    place_id = Column(
        String, ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    district_id = Column(String, primary_key=True, index=True)
    is_inside = Column(Boolean, nullable=False, default=True)


class DistrictIngest(Base):
    """
    Ilce basina ingest durumu. Idempotency ve tazelik hatirlatmasi
    bu tabloya bakiyor.

    status: ok | partial | failed
      - ok:      dort sorgu da basarili
      - partial: bbox dortte bolunmesine ragmen bazi parcalar alinamadi
      - failed:  hicbir sorgu tamamlanmadi
    """

    __tablename__ = "district_ingest"

    district_id = Column(String, primary_key=True)
    fetched_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    place_count = Column(Integer, nullable=False, default=0)
    query_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="ok", index=True)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # create_all yalnizca EKSIK TABLOYU yaratir, mevcut tabloya kolon
        # EKLEMEZ. Projede alembic yok; yeni kolonlar bu idempotent
        # kontrolle ekleniyor. Aksi halde calisan bir kurulumda
        # "no such column: places.source" ile karsilasilir.
        cols = await conn.exec_driver_sql("PRAGMA table_info(places)")
        if "source" not in {row[1] for row in cols.fetchall()}:
            await conn.exec_driver_sql(
                "ALTER TABLE places ADD COLUMN source TEXT NOT NULL DEFAULT 'osm'"
            )

    # Initialize overrides_version
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GlobalState).where(GlobalState.key == "overrides_updated_at")
        )
        if not result.scalar_one_or_none():
            state = GlobalState(
                key="overrides_updated_at",
                value=str(int(datetime.datetime.utcnow().timestamp())),
            )
            session.add(state)
            await session.commit()


async def get_db():
    """Dependency for getting async database sessions."""
    async with AsyncSessionLocal() as session:
        yield session
