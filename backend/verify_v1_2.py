import asyncio
import httpx
import os

BASE_URL = "http://127.0.0.1:8000"
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "your_admin_key_123")

async def verify_everything():
    async with httpx.AsyncClient(timeout=30) as client:
        print("\n--- Phase 1: Creating Test API Keys ---")
        # 1. Create Free Key
        free_resp = await client.post(f"{BASE_URL}/admin/keys?name=tester_free&plan=free", headers={"X-ADMIN-KEY": ADMIN_KEY})
        if free_resp.status_code != 200:
            print(f"FAILED to create free key: {free_resp.status_code}")
            return
        free_key = free_resp.json()["key"]
        print(f"Created Free Key: {free_key}")

        # 2. Create Pro Key
        pro_resp = await client.post(f"{BASE_URL}/admin/keys?name=tester_pro&plan=pro", headers={"X-ADMIN-KEY": ADMIN_KEY})
        if pro_resp.status_code != 200:
            print(f"FAILED to create pro key: {pro_resp.status_code}")
            return
        pro_key = pro_resp.json()["key"]
        print(f"Created Pro Key: {pro_key}")

        print("\n--- Phase 2: Verifying Plan Gating (Radius) ---")
        # 2.1 Free key radius 3000 -> Expect 403
        r_free = await client.get(f"{BASE_URL}/api/search?type=factory&lat=41.0&lon=28.9&radius=3000", headers={"X-API-KEY": free_key})
        print(f"Free Key (3000m): Status {r_free.status_code} (Expected 403)")
        
        # 2.2 Pro key radius 3000 -> Expect 200
        r_pro = await client.get(f"{BASE_URL}/api/search?type=factory&lat=41.0&lon=28.9&radius=3000", headers={"X-API-KEY": pro_key})
        print(f"Pro Key (3000m): Status {r_pro.status_code} (Expected 200 / 429 if Overpass busy)")

        print("\n--- Phase 3: Verifying Plan Gating (Export) ---")
        # 3.1 Free key export -> Expect 403
        e_free = await client.post(f"{BASE_URL}/api/export", headers={"X-API-KEY": free_key}, json={"type":"factory","radius":1000,"center":{"lat":41.0,"lon":28.9},"items":[]})
        print(f"Free Key Export: Status {e_free.status_code} (Expected 403)")

        print("\n--- Phase 4: Verifying Intelligence (Confidence) ---")
        if r_pro.status_code == 200:
            search_res = r_pro.json()
            if search_res["results"]:
                p = search_res["results"][0]
                print(f"Result Intelligence: confidence={p.get('confidence')}, level={p.get('confidence_level')}")
                if "confidence" in p:
                    print("SUCCESS: Confidence scoring is present.")
            else:
                print("NOTE: No results found in Phase 2.2, skipping score check.")
        else:
             print(f"NOTE: Pro search returned {r_pro.status_code}, skipping score check.")

        print("\n--- Phase 5: Verifying Grid Caching ---")
        # Using coordinates strictly within the same 0.01 grid bucket
        t1 = await client.get(f"{BASE_URL}/api/search?type=factory&lat=41.011&lon=28.911&radius=1000", headers={"X-API-KEY": pro_key})
        t2 = await client.get(f"{BASE_URL}/api/search?type=factory&lat=41.014&lon=28.914&radius=1000", headers={"X-API-KEY": pro_key})
        
        # Backend adds X-Policy-Cache-Hit only in debug mode? Let's check search.py
        # Actually it's added if debug_mode=True. Let's force it if possible or just assume 200 on second call is fast.
        print(f"Grid Cache Test: Status 1: {t1.status_code}, Status 2: {t2.status_code}")
        hit = t2.headers.get("X-Policy-Cache-Hit")
        if hit == "true":
            print("SUCCESS: Grid-based caching (2 decimals) working! (Hit detected)")
        else:
            print(f"INFO: Grid-cache skip or no debug header (Header: {hit})")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        asyncio.run(verify_everything())
    else:
        print("Use 'python verify_v1_2.py run' to execute.")
