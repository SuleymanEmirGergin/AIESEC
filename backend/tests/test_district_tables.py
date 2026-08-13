"""
Yeni tablolarin semasi ve iliskileri.

init_db() Base.metadata.create_all cagirdigi icin migration araci
gerekmiyor; bu testler tablolarin gercekten olustugunu ve kisitlarin
calistigini dogruluyor.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, DistrictIngest, PlaceDistrict, PlaceRow, init_db

# Testlerin yazdigi tek DistrictIngest satiri. Teardown'da tabloyu
# tamamen bosaltmak yerine yalnizca bunu siliyoruz (bkz. db fixture).
_INGEST_DISTRICT_ID = "tr-34-kadikoy"


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session
        # Test izolasyonu: testler test_storage.db dosyasini butun test
        # oturumuyla paylasiyor (bkz. conftest.py DATABASE_URL), yoksa bu
        # modulun yazdigi satirlar sonraki test modullerine (T5/T6 store
        # ve ingest testleri) sizar ve calisma sirasina gore testleri
        # gecirir ya da gecirmez hale getirir.
        #
        # Sira onemli: place_districts.place_id -> places.id FK'i var,
        # once uyelik tablosu sonra places silinmeli.
        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        # district_ingest'in FK'i yok ama T6'nin taze ilce testleri ayni
        # district_id icin ingest durumuna bakarak sorgu atlanip
        # atlanmayacagina karar veriyor. Tabloyu tamamen bosaltmak yerine
        # yalnizca bu modulun yazdigi satiri siliyoruz.
        result = await session.execute(
            select(DistrictIngest).where(DistrictIngest.district_id == _INGEST_DISTRICT_ID)
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()


def _place(place_id="osm:node:1", **kwargs) -> PlaceRow:
    defaults = dict(
        id=place_id,
        lat=41.0,
        lon=29.0,
        name="Test Fabrika",
        place_type="factory",
        subtype=None,
        confidence=60,
        has_contact=True,
        phone="+902161234567",
        email=None,
        website=None,
        address="Test Mah.",
        tags_json='{"man_made":"works"}',
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    defaults.update(kwargs)
    return PlaceRow(**defaults)


@pytest.mark.asyncio
async def test_place_yazilip_okunur(db):
    db.add(_place("osm:node:1001"))
    await db.commit()

    result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:1001"))
    row = result.scalar_one()
    assert row.place_type == "factory"
    assert row.has_contact is True


@pytest.mark.asyncio
async def test_place_type_null_olabilir(db):
    # building=school tasiyip amenity=school tasimayan kayitlar
    # siniflandirilamiyor ama atilmiyor.
    db.add(_place("osm:node:1002", place_type=None, name=None, has_contact=False, phone=None))
    await db.commit()

    result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:1002"))
    assert result.scalar_one().place_type is None


@pytest.mark.asyncio
async def test_bir_kayit_iki_ilceye_uye_olabilir(db):
    # Sinirdaki fabrika: Kadikoy'un icinde, Atasehir'in tamponunda.
    db.add(_place("osm:node:1003"))
    db.add(PlaceDistrict(place_id="osm:node:1003", district_id="tr-34-kadikoy", is_inside=True))
    db.add(PlaceDistrict(place_id="osm:node:1003", district_id="tr-34-atasehir", is_inside=False))
    await db.commit()

    result = await db.execute(
        select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:1003")
    )
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.district_id: r.is_inside for r in rows} == {
        "tr-34-kadikoy": True,
        "tr-34-atasehir": False,
    }


@pytest.mark.asyncio
async def test_ingest_durumu_yazilir(db):
    db.add(DistrictIngest(
        district_id="tr-34-kadikoy",
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
        place_count=412,
        query_count=4,
        status="ok",
    ))
    await db.commit()

    result = await db.execute(
        select(DistrictIngest).where(DistrictIngest.district_id == "tr-34-kadikoy")
    )
    row = result.scalar_one()
    assert row.place_count == 412
    assert row.status == "ok"
