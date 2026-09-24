"""Tests for reference point distance calculation and sorting."""

from unittest.mock import patch

from tests.conftest import overpass_stub

SEAM = "app.search_service.overpass_client.query"


class TestReferenceDistance:
    """Tests for ref_lat/ref_lon functionality in /api/search."""

    def test_search_with_reference_distance(self, client):
        """
        Referans noktasina gore mesafe hesaplanip siralanmali.
        Arama merkezi: 41.0, 29.0
        Node 1: 41.01, 29.01 (merkeze ~1.4 km)
        Node 2: 41.02, 29.02 (merkeze ~2.8 km)
        Referans: 41.025, 29.025 -> Node 2 referansa daha yakin.
        """
        elements = [
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

        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=5000&type=kindergarten"
                "&ref_lat=41.025&ref_lon=29.025"
            )

        assert response.status_code == 200
        results = response.json()["results"]

        assert len(results) == 2
        # Referansa yakin olan basta
        assert results[0]["name"] == "Node 2"
        assert results[1]["name"] == "Node 1"
        assert results[0]["distance_m"] < results[1]["distance_m"]
        # Arama merkezine gore mesafe hala dogru olmali
        assert results[1]["distance"] < results[0]["distance"]

    def test_search_without_reference_distance(self, client):
        """ref_* verilmezse distance_m dolmamali (geriye donuk uyum)."""
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.01,
                "lon": 29.01,
                "tags": {"amenity": "kindergarten", "name": "Node 1"},
            }
        ]

        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=1500&type=kindergarten"
            )

        assert response.status_code == 200
        results = response.json()["results"]

        assert len(results) == 1
        assert results[0]["distance_m"] is None
        assert results[0]["distance"] is not None

    def test_invalid_reference_coordinates(self, client):
        """ref_lat / ref_lon aralik disi ise 422 donmeli."""
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&type=kindergarten&ref_lat=100"
        )
        assert response.status_code == 422

        response = client.get(
            "/api/search?lat=41.0&lon=29.0&type=kindergarten&ref_lon=200"
        )
        assert response.status_code == 422
