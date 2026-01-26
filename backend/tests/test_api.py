"""Integration tests for API endpoints."""

from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.cache import cache


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear cache before each test."""
    cache.clear()
    yield
    cache.clear()


client = TestClient(app)


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check(self):
        """Test health check returns 200."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "version" in response.json()


class TestRootEndpoint:
    """Tests for root endpoint."""

    def test_root(self):
        """Test root endpoint returns API info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "FastAPI OSM Backend"
        assert "version" in data
        assert data["docs"] == "/docs"


class TestSearchEndpoint:
    """Tests for /api/search endpoint."""

    def test_missing_required_params(self):
        """Test request without required parameters."""
        response = client.get("/api/search")
        assert response.status_code == 422  # Validation error

    def test_invalid_type(self):
        """Test request with invalid type parameter."""
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=invalid_type"
        )
        assert response.status_code == 422

    def test_radius_out_of_bounds_low(self):
        """Test request with radius below minimum."""
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=50&type=kindergarten"
        )
        assert response.status_code == 422

    def test_radius_out_of_bounds_high(self):
        """Test request with radius above maximum."""
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=10000&type=kindergarten"
        )
        assert response.status_code == 422

    def test_invalid_latitude(self):
        """Test request with invalid latitude."""
        response = client.get(
            "/api/search?lat=100.0&lon=29.0&radius=1500&type=kindergarten"
        )
        assert response.status_code == 422

    def test_invalid_longitude(self):
        """Test request with invalid longitude."""
        response = client.get(
            "/api/search?lat=41.0&lon=200.0&radius=1500&type=kindergarten"
        )
        assert response.status_code == 422

    @patch("app.routers.search.fetch_overpass")
    async def test_kindergarten_search_success(self, mock_fetch):
        """Test successful kindergarten search."""
        # Mock Overpass response
        mock_fetch.return_value = {
            "elements": [
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
        }

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "kindergarten"
        assert data[0]["name"] == "Test Kindergarten"
        assert data[0]["source"] == "osm_overpass"
        assert "distance" in data[0]

    @patch("app.routers.search.fetch_overpass")
    async def test_school_classification_filtering(self, mock_fetch):
        """Test that only matching school levels are returned."""
        # Mock Overpass response with mixed school types
        mock_fetch.return_value = {
            "elements": [
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
        }

        # Request only primary schools
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=2000&type=primary_school"
        )

        assert response.status_code == 200
        data = response.json()
        # Should only return 2 primary schools, not the middle school
        assert len(data) == 2
        assert all(p["type"] == "primary_school" for p in data)

    @patch("app.routers.search.fetch_overpass")
    async def test_b2b_classification_filtering(self, mock_fetch):
        """Test that only matching B2B types are returned."""
        mock_fetch.return_value = {
            "elements": [
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
        }

        # Request only factories
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=2000&type=factory"
        )

        assert response.status_code == 200
        data = response.json()
        # Should only return factory, not office
        assert len(data) == 1
        assert data[0]["type"] == "factory"

    @patch("app.api.fetch_overpass")
    async def test_distance_sorting(self, mock_fetch):
        """Test that results are sorted by distance."""
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 1,
                    "lat": 41.020,  # Farther
                    "lon": 28.990,
                    "tags": {"amenity": "kindergarten", "name": "Far Kindergarten"},
                },
                {
                    "type": "node",
                    "id": 2,
                    "lat": 41.001,  # Closer
                    "lon": 29.001,
                    "tags": {"amenity": "kindergarten", "name": "Near Kindergarten"},
                },
            ]
        }

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=3000&type=kindergarten"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # First result should be closer
        assert data[0]["name"] == "Near Kindergarten"
        assert data[1]["name"] == "Far Kindergarten"
        assert data[0]["distance"] < data[1]["distance"]

    @patch("app.routers.search.fetch_overpass")
    async def test_cache_functionality(self, mock_fetch):
        """Test that cache works correctly."""
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 123,
                    "lat": 41.015,
                    "lon": 28.980,
                    "tags": {"amenity": "kindergarten", "name": "Test"},
                }
            ]
        }

        # First request - should call Overpass
        response1 = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )
        assert response1.status_code == 200
        assert mock_fetch.call_count == 1

        # Second request - should use cache
        response2 = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )
        assert response2.status_code == 200
        assert mock_fetch.call_count == 1  # Still 1, not called again

        # Same data
        assert response1.json() == response2.json()

    @patch("app.routers.search.fetch_overpass")
    async def test_unnamed_flag(self, mock_fetch):
        """Test that unnamed flag is set for places without names."""
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 1,
                    "lat": 41.015,
                    "lon": 28.980,
                    "tags": {"industrial": "factory"},  # No name tag
                }
            ]
        }

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=factory"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] is None
        assert data[0]["unnamed"] is True

    @patch("app.routers.search.fetch_overpass", side_effect=Exception("Network error"))
    async def test_overpass_failure(self, mock_fetch):
        """Test handling of Overpass API failures."""
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )

        assert response.status_code == 502
        assert "Overpass API error" in response.json()["detail"]


class TestRateLimiting:
    """Tests for rate limiting."""

    def test_rate_limit_not_exceeded_in_normal_use(self):
        """Test that normal requests don't hit rate limit."""
        # Make 10 requests (well below 60/min limit)
        for _ in range(10):
            response = client.get("/health")
            assert response.status_code == 200

    # Note: Testing actual rate limit exhaustion requires 60+ requests
    # which is slow for unit tests. This can be tested manually or in E2E tests.
