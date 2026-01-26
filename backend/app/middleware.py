"""Prometheus metrics middleware for FastAPI."""

import time
from fastapi import Request
from prometheus_client import Counter, Histogram
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Metrics definitions
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "Duration of HTTP requests in seconds",
    ["method", "endpoint"]
)

CACHE_HITS_TOTAL = Counter(
    "cache_hits_total",
    "Total number of cache hits"
)

CACHE_MISSES_TOTAL = Counter(
    "cache_misses_total",
    "Total number of cache misses"
)

OVERPASS_REQUESTS_TOTAL = Counter(
    "overpass_requests_total",
    "Total number of Overpass API requests",
    ["status"]
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect HTTP metrics."""

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request and collect metrics."""
        method = request.method
        path = request.url.path
        
        # Avoid high cardinality for unknown paths
        # Map dynamic paths to placeholders if needed
        endpoint = path
        if path.startswith("/api/search"):
            endpoint = "/api/search"
        elif path.startswith("/admin/cache"):
            endpoint = "/admin/cache"

        start_time = time.time()
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            
            HTTP_REQUESTS_TOTAL.labels(
                method=method, 
                endpoint=endpoint, 
                status=status_code
            ).inc()
            
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method, 
                endpoint=endpoint
            ).observe(duration)

        return response
