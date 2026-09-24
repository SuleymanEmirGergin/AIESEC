from unittest.mock import patch

from fastapi.testclient import TestClient

from app.cache import cache
from app.main import app

client = TestClient(app)


def verify():
    cache.clear()
    with patch("app.routers.search.fetch_overpass") as mock_fetch:
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
        print("Testing search with ref point...")
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&radius=5000&type=kindergarten&ref_lat=41.025&ref_lon=29.025"
        )

        assert response.status_code == 200
        data = response.json()
        results = data["results"]

        assert len(results) == 2
        print(f"Results sorted by distance_m: {[r['name'] for r in results]}")
        assert results[0]["name"] == "Node 2"
        assert results[1]["name"] == "Node 1"

        # Check distance_m presence
        assert results[0]["distance_m"] is not None
        assert results[0]["distance_m"] < results[1]["distance_m"]
        print("Distance calculations verified.")

    print("Verification successful!")


if __name__ == "__main__":
    verify()
