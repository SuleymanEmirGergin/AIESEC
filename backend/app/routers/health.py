"""Advanced health check router."""

import os
import time
from typing import Any, Dict

import psutil
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app import __version__
from app.overpass import overpass_client

router = APIRouter(prefix="/health", tags=["health"])


class CheckResult(BaseModel):
    """Result of a single health check."""

    status: str
    latency_ms: float | None = None
    details: Dict[str, Any] | None = None


class HealthResponse(BaseModel):
    """Consolidated health check response."""

    status: str
    version: str
    timestamp: str
    checks: Dict[str, CheckResult]


async def check_overpass() -> CheckResult:
    """Check Overpass API reachability."""
    start_time = time.time()
    try:
        # Minimal query to test connectivity
        query = "[out:json][timeout:5]; node(around:1,41,29); out count;"
        await overpass_client.query(query)
        latency = (time.time() - start_time) * 1000
        return CheckResult(status="pass", latency_ms=round(latency, 2))
    except Exception as e:
        return CheckResult(status="fail", details={"error": str(e)})


def check_memory() -> CheckResult:
    """Check memory usage."""
    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    mem_percent = psutil.virtual_memory().percent

    status_str = "pass"
    if mem_percent > 90:
        status_str = "warn"

    return CheckResult(
        status=status_str,
        details={
            "rss_bytes": mem_info.rss,
            "vms_bytes": mem_info.vms,
            "system_percent": mem_percent,
        },
    )


@router.get("/live", status_code=status.HTTP_200_OK)
async def liveness_probe():
    """Liveness probe for Kubernetes/Docker."""
    return {"status": "ok"}


@router.get("/ready", response_model=HealthResponse)
async def readiness_probe(response: Response):
    """Readiness probe checking dependencies."""
    overpass_result = await check_overpass()
    memory_result = check_memory()

    # overall status
    overall_status = "healthy"
    if overpass_result.status == "fail":
        overall_status = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif memory_result.status == "warn":
        overall_status = "degraded"

    return HealthResponse(
        status=overall_status,
        version=__version__,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        checks={"overpass": overpass_result, "memory": memory_result},
    )


@router.get("/startup")
async def startup_probe():
    """Startup probe confirming initialization."""
    return {"status": "started", "version": __version__}
