import logging
import os
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.middleware import OVERPASS_REQUESTS_TOTAL

logger = logging.getLogger(__name__)


class OverpassError(Exception):
    """Base exception for Overpass related errors."""
    pass


class OverpassTransientError(OverpassError):
    """Errors that are potentially recoverable (Mirror down, Timeout, 429)."""
    pass


class OverpassPermanentError(OverpassError):
    """Errors that won't resolve with retry (Query syntax, Input validation)."""
    pass


class OverpassEndpoint:
    """State for a single Overpass mirror endpoint."""

    def __init__(self, url: str):
        self.url = url
        self.fail_count = 0
        self.cooldown_until: Optional[datetime] = None

    def is_healthy(self) -> bool:
        """Check if endpoint is healthy or cooldown expired."""
        if not self.cooldown_until:
            return True
        if datetime.now() > self.cooldown_until:
            self.fail_count = 0
            self.cooldown_until = None
            return True
        return False

    def mark_failure(self, max_fails: int = 1, cooldown_sec: int = 60):
        """
        Register a failure and trigger cooldown if threshold met.

        max_fails=1 (eskiden 2): basarisiz olan aynayi hemen devre disi
        birak. Onceki davranista ayni yavas ayna bir kez daha deneniyordu;
        olcumde bu tek basina 60 sn israf ediyordu (deneme 1 ve 2 ayni
        endpoint'e gidiyordu). Elimizde birden fazla ayna varken dogru
        hamle beklemek degil digerine gecmek.
        """
        self.fail_count += 1
        if self.fail_count >= max_fails:
            self.cooldown_until = datetime.now() + timedelta(seconds=cooldown_sec)

    def mark_success(self):
        """Reset failure counter and clear cooldown."""
        self.fail_count = 0
        self.cooldown_until = None


class OverpassClient:
    """Robust client with multi-endpoint failover and circuit breaker."""

    def __init__(self):
        # Configure endpoints from env
        urls_raw = os.getenv("OVERPASS_URLS", os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter"))
        urls = [u.strip() for u in urls_raw.split(",") if u.strip()]
        self.endpoints = [OverpassEndpoint(u) for u in urls]
       
        # Increased default to 60s
        self.timeout = int(os.getenv("OVERPASS_TIMEOUT", "60"))
        self._lock = threading.Lock()

        # Overpass kullanim politikasi kendini tanitan bir User-Agent
        # zorunlu kiliyor. Bu header olmadan sunucu istekleri
        # 406 Not Acceptable ile reddediyor.
        self.user_agent = os.getenv(
            "OVERPASS_USER_AGENT", "nearby-place-finder/1.0 (backend)"
        )

    def _get_best_endpoint(self) -> OverpassEndpoint:
        """Return first healthy endpoint, or first endpoint as fallback."""
        with self._lock:
            for ep in self.endpoints:
                if ep.is_healthy():
                    return ep
            return self.endpoints[0]

    async def query(self, query_text: str, debug: bool = False) -> Dict[str, Any]:
        """
        Execute query with retry/failover.
       
        Returns:
            Dict containing OSM results and debug metadata
        """
        # Deneme sayisi 5'ten 3'e indirildi ve bekleme suresi kisaltildi.
        # Failover artik ilk basarisizlikta devreye girdigi icin 3 deneme
        # 3 farkli aynaya karsilik geliyor; ayni aynayi tekrar denemek
        # yerine siradakine geciliyor.
        #
        # Olculen en kotu durum: 5 x 60 sn + 24 sn backoff = ~324 sn
        # Yeni en kotu durum:    3 x 60 sn +  3 sn backoff = ~183 sn
        @retry(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=4),
            retry=retry_if_exception_type((OverpassTransientError, httpx.RequestError)),
            reraise=True
        )
        async def _do_query():
            endpoint = self._get_best_endpoint()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        endpoint.url,
                        data={"data": query_text},
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "User-Agent": self.user_agent,
                        },
                    )
               
                if response.status_code == 429:
                    raise OverpassTransientError(f"HTTP 429")
               
                if response.status_code in [500, 502, 503, 504]:
                    raise OverpassTransientError(f"HTTP {response.status_code}")
               
                response.raise_for_status()
                data = response.json()
               
                if "remark" in data or "message" in data:
                    msg = data.get("remark") or data.get("message")
                    if any(kw in msg.lower() for kw in ["too many", "load", "runtime error"]):
                        raise OverpassTransientError(f"Overpass Remark Limit")
                    raise OverpassPermanentError(msg)
               
                endpoint.mark_success()
                OVERPASS_REQUESTS_TOTAL.labels(status="success").inc()
                if debug:
                    data["_debug"] = {"endpoint": endpoint.url}
                return data

            except Exception as e:
                OVERPASS_REQUESTS_TOTAL.labels(status="error").inc()
                endpoint.mark_failure()
                raise e

        return await _do_query()


# Global client instance
overpass_client = OverpassClient()


def build_overpass_query(
    requested_type: str,
    lat: float,
    lon: float,
    radius: int,
    stage: int = 1,
    mode: str = "around",
    bbox: Optional[Tuple[float, float, float, float]] = None
) -> str:
    """
    Build optimized Overpass QL query.
   
    Args:
        requested_type: Search category
        lat, lon, radius: Search constraints
        stage: 1 (Named only), 2 (Unnamed/All)
        mode: "around" or "bbox"
        bbox: Optional pre-calculated bbox
    """
    # Location chunk
    if mode == "bbox" and bbox:
        loc = f"({bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f})"
    else:
        loc = f"(around:{radius},{lat},{lon})"

    # Filter chunks
    name_filter = '["name"]' if stage == 1 else '[!"name"]'
   
    # Tag logic mapping
    type_filters = {
        "factory": [
            '["man_made"="works"]', '["industrial"]', '["building"="industrial"]', 
            '["building"="warehouse"]', '["landuse"="industrial"]'
        ],
        "office": ['["office"]', '["building"="commercial"]', '["building"="office"]'],
        "workshop": ['["craft"]', '["industrial"="workshop"]'],
        "kindergarten": ['["amenity"="kindergarten"]', '["building"="kindergarten"]'],
        "school": ['["amenity"="school"]', '["building"="school"]', '["education"="school"]'],
        "college_university": [
            '["amenity"="university"]', '["amenity"="college"]', 
            '["building"="university"]', '["education"="university"]'
        ]
    }
   
    # Specialized type map
    t_map = {
        "primary_school": "school",
        "middle_school": "school",
        "high_school": "school",
        "private_school": "school",
        "college_keyword": "school",
        "college_university": "college_university"
    }
    key = t_map.get(requested_type, requested_type)

    filters = type_filters.get(key, [])
   
    query_lines = []
    for f in filters:
        # Optimization: use nwr shorthand
        query_lines.append(f"  nwr{f}{name_filter}{loc};")

    timeout_cfg = int(os.getenv("OVERPASS_TIMEOUT", "60"))
   
    query_body = "\n".join(query_lines)
    query = f"""[out:json][timeout:{timeout_cfg}];
(
{query_body}
);
out tags center;"""
    return query
