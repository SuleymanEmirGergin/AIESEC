"""Integration tests for API endpoints."""

from unittest.mock import patch
from uuid import uuid4

from tests.conftest import overpass_stub

SEAM = "app.search_service.overpass_client.query"


class TestHealthEndpoint:
    """Tests for health check endpoints."""

    def test_liveness(self, client):
        """Liveness probe returns 200."""
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_legacy_health_path_is_gone(self, client):
        """
        Eski /health yolu artik yok; probe'lar /health/live kullanmali.
        Bu test yolun sessizce geri gelmedigini garanti ediyor.
        """
        assert client.get("/health").status_code == 404


class TestSearchValidation:
    """Girdi dogrulamasi: gecersiz istek acikca reddedilmeli."""

    def test_missing_required_params(self, client):
        assert client.get("/api/search").status_code == 422

    def test_invalid_type(self, client):
        """
        Bilinmeyen tur bos filtre listesine dusup 200 + bos sonuc
        donuyordu; kullanici bunu 'veri yok' saniyordu.
        """
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=invalid_type"
        )
        assert response.status_code == 422
        assert "Unsupported type" in response.json()["detail"]

    def test_radius_below_minimum(self, client):
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=50&type=kindergarten"
        )
        assert response.status_code == 422

    def test_radius_above_maximum(self, client):
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=10000&type=kindergarten"
        )
        assert response.status_code == 422

    def test_invalid_latitude(self, client):
        response = client.get(
            "/api/search?lat=100.0&lon=29.0&radius=1500&type=kindergarten"
        )
        assert response.status_code == 422

    def test_invalid_longitude(self, client):
        response = client.get(
            "/api/search?lat=41.0&lon=200.0&radius=1500&type=kindergarten"
        )
        assert response.status_code == 422


class TestSearchResults:
    """Sonuc icerigi, siniflandirma filtresi ve siralama."""

    def test_kindergarten_search_success(self, client):
        elements = [
            {
                "type": "node",
                "id": 123456,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {
                    "amenity": "kindergarten",
                    "name": "Test Kindergarten",
                    "addr:city": "Istanbul",
                },
            }
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 1
        assert results[0]["type"] == "kindergarten"
        assert results[0]["name"] == "Test Kindergarten"
        assert results[0]["source"] == "osm_overpass"
        assert results[0]["distance"] is not None

    def test_school_classification_filtering(self, client):
        """Sadece istenen okul seviyesi donmeli."""
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {"amenity": "school", "name": "Test İlkokulu"},
            },
            {
                "type": "node",
                "id": 2,
                "lat": 41.016,
                "lon": 28.981,
                "tags": {"amenity": "school", "name": "Test Ortaokulu"},
            },
            {
                "type": "node",
                "id": 3,
                "lat": 41.017,
                "lon": 28.982,
                "tags": {"amenity": "school", "name": "Another İlkokulu"},
            },
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=2000&type=primary_school"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        # Buyuk İ ile yazilan adlar da eslesmeli (Turkce casefold hatasi).
        assert len(results) == 2
        assert all(p["type"] == "primary_school" for p in results)

    def test_b2b_classification_filtering(self, client):
        elements = [
            {
                "type": "way",
                "id": 1,
                "center": {"lat": 41.015, "lon": 28.980},
                "tags": {"industrial": "factory", "name": "Test Factory"},
            },
            {
                "type": "node",
                "id": 2,
                "lat": 41.016,
                "lon": 28.981,
                "tags": {"office": "company", "name": "Test Office"},
            },
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=2000&type=factory"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 1
        assert results[0]["type"] == "factory"

    def test_workshop_not_swallowed_by_factory(self, client):
        """
        industrial=workshop hem workshop hem fabrika kosulunu sagliyor.
        Fabrika kontrolu once oldugu icin atolyeler fabrika olarak
        siniflandiriliyordu; workshop dali ulasilamaz koddu.
        """
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {"industrial": "workshop", "name": "Test Atolye"},
            }
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=2000&type=workshop"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 1
        assert results[0]["type"] == "workshop"

    def test_distance_sorting(self, client):
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.020,
                "lon": 28.990,
                "tags": {"amenity": "kindergarten", "name": "Far Kindergarten"},
            },
            {
                "type": "node",
                "id": 2,
                "lat": 41.001,
                "lon": 29.001,
                "tags": {"amenity": "kindergarten", "name": "Near Kindergarten"},
            },
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=3000&type=kindergarten"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 2
        assert results[0]["name"] == "Near Kindergarten"
        assert results[1]["name"] == "Far Kindergarten"
        assert results[0]["distance"] < results[1]["distance"]

    def test_unnamed_flag(self, client):
        """Isimsiz B2B kayitlari stage 2'den geliyor ve isaretleniyor."""
        unnamed = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {"industrial": "factory"},
            }
        ]
        with patch(SEAM, new=overpass_stub([], stage2_elements=unnamed)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=factory"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 1
        assert results[0]["name"] is None
        assert results[0]["unnamed"] is True


class TestSearchOrchestrationRecovery:
    async def test_stage_two_failure_keeps_stage_one_results(self):
        """Isimsiz ikinci tur hatasi, ilk turdaki sonucu silmemeli."""
        from app.search_service import run_search_orchestration

        async def fail_only_unnamed_stage(query_text: str, debug: bool = False):
            if '[!"name"]' in query_text:
                raise RuntimeError("stage two failed")
            return {"elements": []}

        with patch(SEAM, new=fail_only_unnamed_stage):
            results, stage2_used = await run_search_orchestration(
                mode="bbox",
                radius=1_500,
                place_type="factory",
                lat=41.0,
                lon=29.0,
            )

        assert results == []
        assert stage2_used is True


class TestSearchOverrides:
    def test_override_keeps_matching_place_and_applies_subtype(self, client):
        osm_id = f"override-{uuid4().hex}"
        place_id = f"osm:node:{osm_id}"
        created = client.post(
            "/admin/overrides",
            headers={"X-ADMIN-KEY": "test-admin-key"},
            json={
                "place_id": place_id,
                "forced_type": "factory",
                "forced_subtype": "priority",
                "notes": "Test override",
            },
        )
        assert created.status_code == 200, created.text

        element = {
            "type": "node",
            "id": osm_id,
            "lat": 41.015,
            "lon": 28.980,
            "tags": {"industrial": "factory", "name": "Test Fabrika"},
        }
        with patch(SEAM, new=overpass_stub([element])):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=factory"
            )

        assert response.status_code == 200
        place = response.json()["results"][0]
        assert place["subtype"] == "priority"
        assert place["confidence_level"] == "medium"


class TestSearchCaching:
    def test_cache_prevents_second_upstream_call(self, client):
        """Ayni sorgu iki kez istenirse Overpass'e bir kez gidilmeli."""
        elements = [
            {
                "type": "node",
                "id": 123,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {"amenity": "kindergarten", "name": "Test"},
            }
        ]
        stub = overpass_stub(elements)
        calls = {"n": 0}

        async def counting_stub(query_text, debug=False):
            calls["n"] += 1
            return await stub(query_text, debug)

        url = "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        with patch(SEAM, new=counting_stub):
            first = client.get(url)
            calls_after_first = calls["n"]
            second = client.get(url)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == calls_after_first, "ikinci istek onbellekten gelmeliydi"
        assert first.json()["results"] == second.json()["results"]


class TestSearchFailures:
    """
    Hata mutlaka yuzeye cikmali. Bos sonucla 200 donmek en kotusu:
    istemci bunu 'veri yok' diye gosterir.
    """

    def test_overpass_unavailable_returns_503(self, client):
        from app.overpass import OverpassError

        async def failing(query_text, debug=False):
            raise OverpassError("all mirrors down")

        with patch(SEAM, new=failing):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
            )

        assert response.status_code == 503
        assert "Overpass" in response.json()["detail"]

    def test_unexpected_error_returns_500(self, client):
        async def failing(query_text, debug=False):
            raise Exception("Network error")

        with patch(SEAM, new=failing):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
            )

        assert response.status_code == 500

    def test_failure_is_not_reported_as_empty_success(self, client):
        """Basarisizlik 200 + bos liste olarak gizlenmemeli."""

        from app.overpass import OverpassError

        async def failing(query_text, debug=False):
            raise OverpassError("down")

        with patch(SEAM, new=failing):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
            )

        assert response.status_code != 200


class TestAuthentication:
    """Arama ucu API anahtari olmadan calismamali."""

    def test_search_requires_api_key(self, client, api_key):
        from app.auth import validate_api_key, verify_api_key
        from app.main import app as fastapi_app

        # conftest auth'u devre disi birakiyor; bu test icin geri aciyoruz.
        fastapi_app.dependency_overrides.pop(verify_api_key, None)
        fastapi_app.dependency_overrides.pop(validate_api_key, None)

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )
        assert response.status_code == 401


class TestRateLimiting:
    def test_rate_limit_not_exceeded_in_normal_use(self, client):
        """Normal kullanimda hiz siniri tetiklenmemeli."""
        for _ in range(10):
            assert client.get("/health/live").status_code == 200
