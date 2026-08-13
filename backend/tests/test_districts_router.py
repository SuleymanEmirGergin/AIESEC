"""
Ilce endpoint'leri.

Bu yollarin hicbiri Overpass'e gitmiyor; testler de ag kullanmiyor.
Veri gercek districts.geojson uzerinden dogrulaniyor (sahte ilce
kimligi 404 aliyor), POI'ler ise test veritabanina yaziliyor.
"""

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, PlaceDistrict, PlaceRow, init_db
from app.districts import all_districts
from app.store import place_row_values, replace_memberships, upsert_places

# Gercek bir ilce: get_district dogrulamasindan gecmeli.
DISTRICT = all_districts()[0].id
DISTRICT_NAME = all_districts()[0].name


def _element(osm_id: int, tags: dict, lat=41.0, lon=29.0) -> dict:
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": tags}


@pytest.fixture
async def seeded():
    """Bilinen kayitlar: 2 fabrika (biri telefonlu), 1 ofis, 1 tampon kaydi."""
    await init_db()
    async with AsyncSessionLocal() as session:
        rows = [
            place_row_values(
                _element(101, {"name": "Alfa Fabrika", "man_made": "works", "phone": "111"}),
                "factory", 80, None,
            ),
            place_row_values(
                _element(102, {"name": "Beta Fabrika", "man_made": "works"}),
                "factory", 60, None,
            ),
            place_row_values(
                _element(103, {"name": "Gama Ofis", "office": "company"}),
                "office", 70, None,
            ),
            place_row_values(
                _element(104, {"name": "Tampon Fabrika", "man_made": "works"}),
                "factory", 50, None,
            ),
        ]
        await upsert_places(session, rows)
        await replace_memberships(session, DISTRICT, [
            ("osm:node:101", True),
            ("osm:node:102", True),
            ("osm:node:103", True),
            ("osm:node:104", False),  # tampon bolgesi
        ])
        yield session

        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


class TestDistrictListing:
    def test_lists_all_districts(self, client):
        response = client.get("/api/districts")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 80
        assert {"id", "name", "province", "bbox", "center"} <= set(body[0])

    def test_metadata_is_cacheable(self, client):
        """Sinir verisi nadiren degisiyor; tarayici tutabilmeli."""
        response = client.get("/api/districts")
        assert "max-age=86400" in response.headers["cache-control"]

    def test_geojson_is_served_with_long_cache(self, client):
        response = client.get("/api/districts/geojson")
        assert response.status_code == 200
        assert response.json()["type"] == "FeatureCollection"
        assert "immutable" in response.headers["cache-control"]

    def test_boundary_data_needs_no_key(self, client):
        """
        Sinir verisi statik bir varlik ve kisisel veri icermiyor;
        harita cizimi icin anahtar istemek gereksiz surtunme olurdu.
        """
        from app.auth import validate_api_key
        from app.main import app as fastapi_app

        fastapi_app.dependency_overrides.pop(validate_api_key, None)
        assert client.get("/api/districts").status_code == 200
        assert client.get("/api/districts/geojson").status_code == 200


class TestDistrictPlaces:
    async def test_returns_places_of_the_district(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/places")
        assert response.status_code == 200
        body = response.json()
        assert body["district_id"] == DISTRICT
        assert body["total"] == 4
        assert len(body["data"]) == 4

    async def test_type_filter(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/places?types=office")
        assert response.status_code == 200
        assert [p["name"] for p in response.json()["data"]] == ["Gama Ofis"]

    async def test_excluding_buffer_drops_buffer_rows(self, client, seeded):
        response = client.get(
            f"/api/districts/{DISTRICT}/places?include_buffer=false"
        )
        names = [p["name"] for p in response.json()["data"]]
        assert "Tampon Fabrika" not in names
        assert response.json()["total"] == 3

    async def test_pagination_reports_full_total(self, client, seeded):
        """total sayfa boyutundan bagimsiz olmali."""
        response = client.get(f"/api/districts/{DISTRICT}/places?limit=2")
        body = response.json()
        assert len(body["data"]) == 2
        assert body["total"] == 4

    async def test_lead_score_only_filled_for_that_sort(self, client, seeded):
        default_sort = client.get(f"/api/districts/{DISTRICT}/places").json()
        assert all(p["lead_score"] is None for p in default_sort["data"])

        scored = client.get(
            f"/api/districts/{DISTRICT}/places?sort=lead_score"
        ).json()
        assert all(p["lead_score"] is not None for p in scored["data"])
        # Telefonlu kayit en ustte olmali
        assert scored["data"][0]["name"] == "Alfa Fabrika"

    def test_unknown_district_is_404(self, client):
        response = client.get("/api/districts/tr-99-yok/places")
        assert response.status_code == 404

    def test_invalid_sort_is_422(self, client):
        response = client.get(f"/api/districts/{DISTRICT}/places?sort=rastgele")
        assert response.status_code == 422

    def test_places_require_a_key(self, client):
        from app.auth import validate_api_key
        from app.main import app as fastapi_app

        fastapi_app.dependency_overrides.pop(validate_api_key, None)
        response = client.get(f"/api/districts/{DISTRICT}/places")
        assert response.status_code == 401


class TestDistrictSummary:
    async def test_counts_every_type(self, client, seeded):
        """
        10 turun hepsi anahtar olarak donmeli: eksik anahtar
        "sayi yok" ile "sifir" ayrimini bozar.
        """
        response = client.get(f"/api/districts/{DISTRICT}/summary")
        assert response.status_code == 200
        body = response.json()

        assert len(body["counts"]) == 10
        assert body["counts"]["factory"] == 3
        assert body["counts"]["office"] == 1
        assert body["counts"]["workshop"] == 0
        assert body["total"] == 4
        assert body["name"] == DISTRICT_NAME

    async def test_excluding_buffer_lowers_counts(self, client, seeded):
        response = client.get(
            f"/api/districts/{DISTRICT}/summary?include_buffer=false"
        )
        assert response.json()["counts"]["factory"] == 2

    async def test_reports_never_ingested_as_null(self, client, seeded):
        """Ingest edilmemis ilce icin durum alanlari None; arayuz bunu ayirt ediyor."""
        response = client.get(f"/api/districts/{DISTRICT}/summary")
        assert response.json()["fetched_at"] is None
        assert response.json()["status"] is None

    def test_unknown_district_is_404(self, client):
        assert client.get("/api/districts/tr-99-yok/summary").status_code == 404
