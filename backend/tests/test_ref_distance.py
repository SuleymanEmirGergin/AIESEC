"""Tests for reference point distance calculation and sorting."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.cache import cache

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear cache before each test."""
    cache.clear()
    yield
    cache.clear()


class TestReferenceDistance:
    """Tests for ref_lat/ref_lon functionality in /api/search."""

    @patch("app.routers.search.fetch_overpass")
    def test_search_with_reference_distance(self, mock_fetch):
        """Test that reference distance is calculated and sorted correctly."""
        # Mock Overpass response with two nodes
        # Search center: 41.0, 29.0
        # Node 1: 41.01, 29.01 (~1.4km from search center)
        # Node 2: 41.02, 29.02 (~2.8km from search center)
        # Reference point: 41.025, 29.025
        # Node 2 is CLOSER to reference point than Node 1
        
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 1,
                    "lat": 41.01,
                    "lon": 29.01,
                    "tags": {"amenity": "kindergarten", "name": "Node 1"},
                },
                {
                    "type": "node",
                    "id": 2,
                    "lat": 41.02,
                    "lon": 29.02,
                    "tags": {"amenity": "kindergarten", "name": "Node 2"},
                },
            ]
        }

        # Request with reference point near Node 2
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=5000&type=kindergarten&ref_lat=41.025&ref_lon=29.025"
        )

        assert response.status_code == 200
        data = response.json()
        results = data["results"]
        
        assert len(results) == 2
        # Node 2 should be first because it's closer to 41.025, 29.025
        assert results[0]["name"] == "Node 2"
        assert results[1]["name"] == "Node 1"
        
        # Check distance_m presence
        assert "distance_m" in results[0]
        assert results[0]["distance_m"] < results[1]["distance_m"]
        
        # Original distance (from search center) should still be correct
        # Node 1 is closer to search center (41.0, 29.0) than Node 2
        assert results[1]["distance"] < results[0]["distance"]

    @patch("app.routers.search.fetch_overpass")
    def test_search_without_reference_distance(self, mock_fetch):
        """Test backward compatibility (no distance_m without ref_*)."""
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 1,
                    "lat": 41.01,
                    "lon": 29.01,
                    "tags": {"amenity": "kindergarten", "name": "Node 1"},
                }
            ]
        }

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
        )

        assert response.status_code == 200
        data = response.json()
        results = data["results"]
        
        assert len(results) == 1
        assert results[0]["distance_m"] is None
        assert "distance" in results[0]

    def test_invalid_reference_coordinates(self):
        """Test validation of ref_lat and ref_lon."""
        # Invalid lat
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&type=kindergarten&ref_lat=100"
        )
        assert response.status_code == 422
        
        # Invalid lon
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&type=kindergarten&ref_lon=200"
        )
        assert response.status_code == 422
