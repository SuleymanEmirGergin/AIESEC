"""
Ilce endpoint'leri.

Bu yollarin hicbiri Overpass'e gitmiyor (ingest disinda); testler de ag
kullanmiyor. Veri gercek districts.geojson uzerinden dogrulaniyor (sahte
ya da kapsam disi ilce kimligi 422 aliyor -- kapsam disi ilceye maliyet
kilidi burada), POI'ler ise test veritabanina yaziliyor.
"""

from datetime import datetime, timedelta, timezone
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
from app.ingest import IngestResult
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
                _element(
                    101, {"name": "Alfa Fabrika", "man_made": "works", "phone": "111"}
                ),
                "factory",
                80,
                None,
            ),
            place_row_values(
                _element(102, {"name": "Beta Fabrika", "man_made": "works"}),
                "factory",
                60,
                None,
            ),
            place_row_values(
                _element(103, {"name": "Gama Ofis", "office": "company"}),
                "office",
                70,
                None,
            ),
            place_row_values(
                _element(104, {"name": "Tampon Fabrika", "man_made": "works"}),
                "factory",
                50,
                None,
            ),
        ]
        await upsert_places(session, rows)
        await replace_memberships(
            session,
            DISTRICT,
            [
                ("osm:node:101", True),
                ("osm:node:102", True),
                ("osm:node:103", True),
                ("osm:node:104", False),  # tampon bolgesi
            ],
        )
        yield session

        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


class TestDistrictListing:
    def test_lists_all_districts(self, client):
        response = client.get("/api/districts")
        assert response.status_code == 200
        body = response.json()["districts"]
        assert len(body) == 80
        assert {
            "id",
            "name",
            "province",
            "province_plate",
            "bbox",
            "center",
            "ingest",
        } <= set(body[0])

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


class TestIngestStateShape:
    """
    FIX5: ingest alani duz alanlar yerine ic ice bir nesne (ya da None)
    olmali; stale FRESH_AFTER_DAYS'e gore SUNUCUDA hesaplaniyor --
    frontend'in kendi STALE_AFTER_DAYS kopyasini tutmasina gerek kalmiyor.

    seeded fixture'ini kullanmiyor: DistrictIngest, PlaceDistrict/PlaceRow'a
    FK'siz oldugu icin ayri temizlik gerektiriyor (test_ingest.py'deki
    ayni notla tutarli -- bkz. o dosyadaki _INGEST_DISTRICT_IDS aciklamasi).
    """

    @pytest.fixture
    async def ingest_state(self):
        await init_db()
        async with AsyncSessionLocal() as session:
            yield session
            result = await session.execute(
                select(DistrictIngest).where(DistrictIngest.district_id == DISTRICT)
            )
            for row in result.scalars().all():
                await session.delete(row)
            await session.commit()

    async def test_stale_true_when_older_than_fresh_after_days(
        self, client, ingest_state
    ):
        from app.ingest import FRESH_AFTER_DAYS

        old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            days=FRESH_AFTER_DAYS + 5
        )
        ingest_state.add(
            DistrictIngest(
                district_id=DISTRICT,
                fetched_at=old,
                place_count=4,
                query_count=4,
                status="ok",
            )
        )
        await ingest_state.commit()

        body = client.get(f"/api/districts/{DISTRICT}/summary").json()
        assert body["ingest"]["fetched_at"] == old.isoformat()
        assert body["ingest"]["place_count"] == 4
        assert body["ingest"]["status"] == "ok"
        assert body["ingest"]["age_days"] == FRESH_AFTER_DAYS + 5
        assert body["ingest"]["stale"] is True

    async def test_stale_false_when_within_fresh_after_days(self, client, ingest_state):
        recent = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        ingest_state.add(
            DistrictIngest(
                district_id=DISTRICT,
                fetched_at=recent,
                place_count=2,
                query_count=4,
                status="ok",
            )
        )
        await ingest_state.commit()

        body = client.get(f"/api/districts/{DISTRICT}/summary").json()
        assert body["ingest"]["stale"] is False

    def test_never_ingested_is_null_in_list_too(self, client):
        body = client.get("/api/districts").json()["districts"]
        entry = next(d for d in body if d["id"] == DISTRICT)
        assert entry["ingest"] is None


class TestDistrictPlaces:
    async def test_returns_places_of_the_district(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/places")
        assert response.status_code == 200
        body = response.json()
        assert body["query"]["district_id"] == DISTRICT
        assert body["total"] == 4
        assert body["count"] == 4
        assert len(body["results"]) == 4

    async def test_type_filter(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/places?types=office")
        assert response.status_code == 200
        assert [p["name"] for p in response.json()["results"]] == ["Gama Ofis"]

    async def test_excluding_buffer_drops_buffer_rows(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/places?include_buffer=false")
        names = [p["name"] for p in response.json()["results"]]
        assert "Tampon Fabrika" not in names
        assert response.json()["total"] == 3

    async def test_pagination_reports_full_total(self, client, seeded):
        """total sayfa boyutundan bagimsiz olmali."""
        response = client.get(f"/api/districts/{DISTRICT}/places?limit=2")
        body = response.json()
        assert len(body["results"]) == 2
        assert body["total"] == 4

    async def test_lead_score_sort_orders_by_reachability(self, client, seeded):
        """
        lead_score arayuz sozlesmesinde bir alan degil (brief'in
        ClientPlace'inde yok) -- yalnizca siralamayi etkiliyor. Telefonlu
        kayit en ustte olmali.
        """
        response = client.get(f"/api/districts/{DISTRICT}/places?sort=lead_score")
        results = response.json()["results"]
        assert "lead_score" not in results[0]
        assert results[0]["name"] == "Alfa Fabrika"

    async def test_places_expose_is_inside_and_tags(self, client, seeded):
        """
        FIX4: include_buffer=true iken kesin sinir ile tampon kaydini
        ayirt etmenin tek yolu is_inside -- onsuz cagiran ikisini
        ayiramaz. tags de OSM etiketlerinin ayristirilmis hali olmali.
        """
        response = client.get(f"/api/districts/{DISTRICT}/places?include_buffer=true")
        by_name = {p["name"]: p for p in response.json()["results"]}

        assert by_name["Alfa Fabrika"]["is_inside"] is True
        assert by_name["Tampon Fabrika"]["is_inside"] is False
        assert by_name["Alfa Fabrika"]["tags"]["man_made"] == "works"
        assert by_name["Alfa Fabrika"]["tags"]["phone"] == "111"

    async def test_place_uses_client_field_names(self, client, seeded):
        """type alani place_type degil -- brief'in ClientPlace sozlesmesi 'type' istiyor."""
        response = client.get(f"/api/districts/{DISTRICT}/places?types=office")
        place = response.json()["results"][0]
        assert place["type"] == "office"
        assert "place_type" not in place

    def test_unknown_district_is_422(self, client):
        response = client.get("/api/districts/tr-99-yok/places")
        assert response.status_code == 422

    def test_invalid_sort_is_422(self, client):
        response = client.get(f"/api/districts/{DISTRICT}/places?sort=rastgele")
        assert response.status_code == 422

    def test_unknown_type_is_422(self, client):
        # FIX3: yazim hatasi yapan kullanici bos sonuc gorup "bu ilcede
        # yok" sanmasin -- once acikca reddedilsin.
        response = client.get(
            f"/api/districts/{DISTRICT}/places", params={"types": "hastane"}
        )
        assert response.status_code == 422

    def test_valid_multi_type_is_accepted(self, client):
        response = client.get(
            f"/api/districts/{DISTRICT}/places",
            params={"types": "factory,office,kindergarten"},
        )
        assert response.status_code == 200

    def test_places_require_a_key(self, client):
        from app.auth import validate_api_key
        from app.main import app as fastapi_app

        fastapi_app.dependency_overrides.pop(validate_api_key, None)
        response = client.get(f"/api/districts/{DISTRICT}/places")
        assert response.status_code == 401


class TestDistrictSummary:
    async def test_counts_every_type(self, client, seeded):
        """
        16 turun hepsi anahtar olarak donmeli: eksik anahtar
        "sayi yok" ile "sifir" ayrimini bozar.
        """
        response = client.get(f"/api/districts/{DISTRICT}/summary")
        assert response.status_code == 200
        body = response.json()

        assert len(body["counts"]) == 16
        assert body["counts"]["factory"] == 3
        assert body["counts"]["office"] == 1
        assert body["counts"]["workshop"] == 0
        assert body["total"] == 4
        assert body["name"] == DISTRICT_NAME

    async def test_excluding_buffer_lowers_counts(self, client, seeded):
        response = client.get(f"/api/districts/{DISTRICT}/summary?include_buffer=false")
        assert response.json()["counts"]["factory"] == 2

    async def test_reports_never_ingested_as_null(self, client, seeded):
        """Ingest edilmemis ilce icin ingest alani None; arayuz bunu ayirt ediyor."""
        response = client.get(f"/api/districts/{DISTRICT}/summary")
        assert response.json()["ingest"] is None

    def test_unknown_district_is_422(self, client):
        assert client.get("/api/districts/tr-99-yok/summary").status_code == 422

    def test_out_of_scope_province_is_422(self, client):
        # Ankara kapsamda degil; kimlik uretilse bile reddedilmeli.
        assert client.get("/api/districts/tr-06-cankaya/summary").status_code == 422


class TestDistrictIngest:
    """
    FIX1: POST /ingest -- modulun Overpass'e giden TEK ucu.

    ingest_district burada her zaman mock'lu: gercek Overpass davranisi
    test_ingest.py'nin konusu, burada yalniz router'in kapsam kontrolu +
    kimlik + yanit sekli dogrulaniyor.
    """

    @staticmethod
    def _stub_result(**overrides):
        defaults = dict(
            district_id=DISTRICT,
            place_count=12,
            query_count=4,
            status="ok",
            skipped=False,
        )
        defaults.update(overrides)
        return IngestResult(**defaults)

    def test_unknown_district_is_422(self, client):
        exploding = AsyncMock(
            side_effect=AssertionError("ingest_district cagrilmamali")
        )
        with patch("app.routers.districts.ingest_district", new=exploding):
            response = client.post("/api/districts/tr-99-yok/ingest")
        assert response.status_code == 422
        exploding.assert_not_awaited()

    def test_requires_a_key(self, client):
        from app.auth import verify_api_key
        from app.main import app as fastapi_app

        fastapi_app.dependency_overrides.pop(verify_api_key, None)
        exploding = AsyncMock(
            side_effect=AssertionError("ingest_district cagrilmamali")
        )
        with patch("app.routers.districts.ingest_district", new=exploding):
            response = client.post(f"/api/districts/{DISTRICT}/ingest")
        assert response.status_code == 401
        exploding.assert_not_awaited()

    def test_maps_ingest_result_into_response(self, client):
        stub = AsyncMock(
            return_value=self._stub_result(
                place_count=12,
                query_count=4,
                status="ok",
                skipped=False,
            )
        )
        with patch("app.routers.districts.ingest_district", new=stub):
            response = client.post(f"/api/districts/{DISTRICT}/ingest")

        assert response.status_code == 200
        assert response.json() == {
            "district_id": DISTRICT,
            "place_count": 12,
            "query_count": 4,
            "status": "ok",
            "skipped": False,
        }
        stub.assert_awaited_once()

    def test_force_query_param_is_forwarded(self, client):
        stub = AsyncMock(return_value=self._stub_result())
        with patch("app.routers.districts.ingest_district", new=stub):
            client.post(f"/api/districts/{DISTRICT}/ingest?force=true")

        stub.assert_awaited_once()
        # ingest_district(db, district_id, buffer_m, force) -- force son pozisyonel.
        assert stub.call_args.args[-1] is True
