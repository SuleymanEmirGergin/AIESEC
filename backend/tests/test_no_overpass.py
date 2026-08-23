"""
Bu tasarimin merkezi vaadi: ingest edilmis bir ilcede filtre paneliyle
oynamak sorgu maliyeti dogurmaz.

Kapsam: ingest EDILMIS ilce. Talep uzerine ingest (POST .../ingest)
tanimi geregi Overpass'e gidiyor; onun testi bu dosyanin konusu degil
(ingest_district'in kendisi test_ingest.py'de, router'in onu dogru
cagirdigi test_districts_router.py::TestDistrictIngest'te test ediliyor).

Brief'in SORGU_UCLARI listesindeki sabit "tr-34-adalar" yerine dinamik
DISTRICT kullaniliyor ve asagidaki `ingested` fixture'i ile GERCEKTEN
ingest edilmis bir ilce taklit ediliyor (places + place_districts +
district_ingest). Bos/hic dokunulmamis bir ilceye karsi test etmek de
200 donerdi ama "veri yoksa Overpass'e dus" gibi bir regresyonu
yakalamazdi -- gercek satirlar uzerinden sinamak bu sozu daha siki
kilitliyor.
"""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.database import (
    AsyncSessionLocal,
    DistrictIngest,
    PlaceDistrict,
    PlaceRow,
    init_db,
)
from app.districts import all_districts
from app.store import place_row_values, replace_memberships, upsert_places

pytestmark = pytest.mark.skipif(
    not Path("app/data/districts.geojson").exists(),
    reason="app/data/districts.geojson yok; once scripts/fetch_districts.py calistir",
)

# Gercek bir ilce: get_district dogrulamasindan gecmeli.
DISTRICT = all_districts()[0].id


def _element(osm_id: int, tags: dict, lat=41.0, lon=29.0) -> dict:
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": tags}


@pytest.fixture
async def ingested():
    """
    Ingest EDILMIS bir ilceyi taklit eden veri seti: hem places/
    place_districts (sorgu uclarinin okudugu) hem de district_ingest
    (summary/list'in ingest alanini besleyen).
    """
    await init_db()
    async with AsyncSessionLocal() as session:
        rows = [
            place_row_values(
                _element(
                    301, {"name": "Test Fabrika", "man_made": "works", "phone": "111"}
                ),
                "factory",
                80,
                None,
            ),
        ]
        await upsert_places(session, rows)
        await replace_memberships(session, DISTRICT, [("osm:node:301", True)])
        session.add(
            DistrictIngest(
                district_id=DISTRICT,
                place_count=1,
                query_count=4,
                status="ok",
            )
        )
        await session.commit()
        yield session

        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        result = await session.execute(
            select(DistrictIngest).where(DistrictIngest.district_id == DISTRICT)
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()


SORGU_UCLARI = [
    "/api/districts",
    "/api/districts/geojson",
    f"/api/districts/{DISTRICT}/summary",
    f"/api/districts/{DISTRICT}/places",
    f"/api/districts/{DISTRICT}/places?types=factory&has_contact=true",
    f"/api/districts/{DISTRICT}/places?sort=lead_score&min_confidence=40",
    f"/api/districts/{DISTRICT}/places?include_buffer=false&named_only=true&q=test",
]


@pytest.mark.parametrize("path", SORGU_UCLARI)
async def test_sorgu_ucu_overpass_e_gitmiyor(client, ingested, path):
    patlayan = AsyncMock(
        side_effect=AssertionError(
            f"{path} Overpass'e gitti. Sorgu yolu tamamen yerel olmali."
        )
    )
    with patch("app.overpass.overpass_client.query", new=patlayan):
        response = client.get(path)

    assert response.status_code == 200, response.text
    patlayan.assert_not_awaited()


async def test_tum_sorgu_uclari_ag_olmadan_calisir(client, ingested):
    """
    httpx.AsyncClient tamamen devre disi: ag katmani yoksa da
    endpoint'ler yanit vermeli. Cevrimdisi calisma garantisi.
    """
    with patch("httpx.AsyncClient", side_effect=AssertionError("ag cagrisi yapildi")):
        for path in SORGU_UCLARI:
            assert client.get(path).status_code == 200, path
