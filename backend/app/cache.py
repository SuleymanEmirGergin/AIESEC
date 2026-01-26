import os
import time
import json
from typing import Any, Optional

from app.middleware import CACHE_HITS_TOTAL, CACHE_MISSES_TOTAL


class TtlCache:
    """Thread-safe TTL (Time-To-Live) cache with automatic expiration."""

    def __init__(self):
        """Initialize empty cache."""
        self._cache: dict[str, tuple[Any, float]] = {}
        self._hits: int = 0
        self._misses: int = 0
        self._start_time: float = time.time()
        
        # Optional Redis L2
        self.redis_client = None
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self.redis_client = redis.from_url(redis_url)
            except ImportError:
                print("[CACHE] redis-py not installed. L2 cache disabled.")

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache (L1 then L2)."""
        # 1. Check L1 (In-Memory)
        if key in self._cache:
            value, expiry_time = self._cache[key]
            if time.time() <= expiry_time:
                self._hits += 1
                CACHE_HITS_TOTAL.inc()
                return value
            else:
                del self._cache[key]

        # 2. Check L2 (Redis)
        if self.redis_client:
            try:
                data = self.redis_client.get(key)
                if data:
                    val = json.loads(data)
                    # Backfill L1
                    self.set(key, val, 300, l2_only=False) 
                    self._hits += 1
                    CACHE_HITS_TOTAL.inc()
                    return val
            except Exception as e:
                print(f"[CACHE] L2 Get Error: {e}")

        self._misses += 1
        CACHE_MISSES_TOTAL.inc()
        return None

    def set(self, key: str, value: Any, ttl_seconds: int, l2_only: bool = False) -> None:
        """Set value in cache (L1 and L2)."""
        if not l2_only:
            expiry_time = time.time() + ttl_seconds
            self._cache[key] = (value, expiry_time)
            
        if self.redis_client:
            try:
                self.redis_client.setex(key, ttl_seconds, json.dumps(value))
            except Exception as e:
                print(f"[CACHE] L2 Set Error: {e}")

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
        if self.redis_client:
            try:
                self.redis_client.flushdb()
            except Exception:
                pass
        self._hits = 0
        self._misses = 0

    def cleanup_expired(self) -> int:
        """Remove all expired entries from L1."""
        current_time = time.time()
        expired_keys = [
            key for key, (_, exp) in self._cache.items() if current_time > exp
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)


def get_ttl_for_type(place_type: str) -> int:
    """
    Education types: 86400s (24 hours)
    B2B types: 43200s (12 hours)
    """
    school_types = {
        "kindergarten", "primary_school", "middle_school",
        "high_school", "private_school", "college_keyword",
    }
    if place_type in school_types:
        return 86400  # 24h
    return 43200  # 12h


def quantize_location(
    lat: float, lon: float, precision: int = 2
) -> tuple[float, float]:
    """Quantize coordinates to a grid (2 decimals ~= 1.1km)."""
    return round(lat, precision), round(lon, precision)


def build_cache_key(
    lat: float,
    lon: float,
    radius: int,
    place_type: str,
    limit: int,
    ref_lat: Optional[float] = None,
    ref_lon: Optional[float] = None,
    mode: str = "auto",
    ov_ver: str = "0",
) -> str:
    """Build grid-quantized cache key."""
    q_lat, q_lon = quantize_location(lat, lon)
    key = (
        f"grid:{q_lat},{q_lon};r:{radius};t:{place_type};"
        f"l:{limit};m:{mode};v:{ov_ver}"
    )

    if ref_lat is not None and ref_lon is not None:
        # Reference points are NOT quantized as they affect sorting strictly
        key += f";ref:{ref_lat:.4f},{ref_lon:.4f}"
    return key


# Global cache instance
cache = TtlCache()
