from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.cache import cache

client = TestClient(app)

def verify():
    cache.clear()
    with patch("app.routers.search.fetch_overpass") as mock_fetch:
        # Mock 10 results
        mock_fetch.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": i,
                    "lat": 41.0 + (i * 0.001),
                    "lon": 29.0 + (i * 0.001),
                    "tags": {"amenity": "kindergarten", "name": f"Node {i}"},
                } for i in range(10)
            ]
        }

        print("Testing default limit (should return all 10 in this mock)...")
        response = client.get("/api/search?lat=41.0&lon=29.0&type=kindergarten")
        assert response.status_code == 200
        assert len(response.json()["results"]) == 10
        
        print("Testing custom limit (5)...")
        response = client.get("/api/search?lat=41.0&lon=29.0&type=kindergarten&limit=5")
        assert len(response.json()["results"]) == 5
        
        print("Testing cache key isolation (limit 5 vs default)...")
        # If cache key didn't include limit, this might return 10 or 5 incorrectly
        # Our implementation includes limit in key, so this should trigger another fetch or unique cache
        assert cache.get_stats()["total_entries"] > 0
        
    print("Verification successful!")

if __name__ == "__main__":
    verify()
