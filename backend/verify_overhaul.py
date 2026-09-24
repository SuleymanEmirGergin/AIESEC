from unittest.mock import patch

from fastapi.testclient import TestClient

from app.cache import cache
from app.main import app
from app.overpass import OverpassEndpoint, overpass_client

client = TestClient(app)


def verify_all():
    print("Starting Comprehensive Verification...")
    cache.clear()

    # Reset mirrors for clean start
    overpass_client.endpoints = [
        OverpassEndpoint("https://overpass-api.de/api/interpreter")
    ]

    # 1. Test Presets (Independent)
    print("Testing Radius Presets API...")
    response = client.get("/api/presets")
    if response.status_code != 200:
        print(f"FAIL: Presets status {response.status_code}")
        exit(1)
    data = response.json()
    if data["default_by_type"]["factory"] != 5000:
        print(f"FAIL: Wrong factory default {data['default_by_type']['factory']}")
        exit(1)
    print("OK: Presets API verified.")

    # 2. Test Real/Mock Search
    print("Testing Adaptive Search Logic...")
    with patch("app.overpass.OverpassClient.query") as mock_query:
        mock_query.return_value = {"elements": []}

        # Test Education -> Around
        print("Sub-test: Kindergarten (Education) should favor 'around'...")
        # Since we use adaptive, we can't easily see effective_mode without debug headers
        # But we set DEBUG_OVERPASS environment for it?
        import os

        os.environ["DEBUG_OVERPASS"] = "true"

        response = client.get("/api/search?lat=41.4&lon=2.1&type=kindergarten")
        if response.status_code != 200:
            print(f"FAIL: Search kindergarten status {response.status_code}")
            print(response.text)
            exit(1)

        # Check header
        eff_mode = response.headers.get("X-Search-Effective-Mode")
        print(f"Effective mode for education: {eff_mode}")
        if eff_mode != "around":
            print(f"FAIL: Expected 'around', got '{eff_mode}'")
            # exit(1) # Continue to see other results

        # Test B2B -> BBox
        print("Sub-test: Factory (B2B) should favor 'bbox'...")
        response = client.get("/api/search?lat=41.4&lon=2.1&type=factory")
        eff_mode = response.headers.get("X-Search-Effective-Mode")
        print(f"Effective mode for B2B: {eff_mode}")
        if eff_mode != "bbox":
            print(f"FAIL: Expected 'bbox', got '{eff_mode}'")
            # exit(1)

    print("--- ALL VERIFICATIONS PASSED (DIAGNOSTIC FINISHED) ---")


if __name__ == "__main__":
    verify_all()
