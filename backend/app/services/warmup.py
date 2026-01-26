import asyncio
from datetime import datetime
from app.database import AsyncSessionLocal
from app.search_service import run_search_orchestration
from app.cache import cache, build_cache_key, get_ttl_for_type

# Major TR Cities (Center Points)
WARMUP_CITIES = {
    "istanbul": (41.0082, 28.9784),
    "ankara": (39.9334, 32.8597),
    "izmir": (38.4237, 27.1428),
    "bursa": (40.1885, 29.0610),
    "kocaeli": (40.7654, 29.9408),
}

WARMUP_TYPES = ["factory", "office", "kindergarten", "primary_school"]


async def run_warmup():
    """
    Pre-fetch common search results on startup.
    Impact: Massive speed boost for first-time regional users.
    """
    print(f"[WARMUP] Starting cache warmup for {len(WARMUP_CITIES)} cities...")
    start_time = datetime.utcnow()
    
    tasks = []
    for city_name, (lat, lon) in WARMUP_CITIES.items():
        for p_type in WARMUP_TYPES:
            tasks.append(warmup_single(city_name, lat, lon, p_type))
            
    await asyncio.gather(*tasks)
    
    duration = (datetime.utcnow() - start_time).total_seconds()
    print(f"[WARMUP] Complete! Refreshed {len(tasks)} combinations in {duration:.2f}s.")


async def warmup_single(city, lat, lon, p_type):
    """Execution logic for a single warmup bucket with its own session."""
    radius = 5000
    mode = "auto"
    
    # Check L1 first
    cache_key = build_cache_key(lat, lon, radius, p_type, 500, None, None, mode, "0")
    if cache.get(cache_key):
        return

    try:
        async with AsyncSessionLocal() as db:
            results, _ = await run_search_orchestration(
                mode=mode,
                radius=radius,
                place_type=p_type,
                lat=lat,
                lon=lon,
                db=db
            )
            cache.set(cache_key, results, get_ttl_for_type(p_type))
    except Exception as e:
        print(f"[WARMUP] Failed for {city}/{p_type}: {e}")
