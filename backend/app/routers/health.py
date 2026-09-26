"""Advanced health check router."""

import time
from typing import Any, Dict

import psutil
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app import __version__
from app.database import AsyncSessionLocal
from app.limits import limiter

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


async def check_database() -> CheckResult:
    """
    Veritabani erisilebilir mi? Arama ve kayitlar buna bagli.

    Onceden burada canli bir Overpass sorgusu vardi: kimliksiz bir uc her
    cagrida disariya istek atiyordu (maliyet, Overpass'in bizi engellemesi).
    Overpass artik yalnizca aylik veri yenilemede kullaniliyor.
    """
    start_time = time.time()
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return CheckResult(status="pass", latency_ms=round((time.time() - start_time) * 1000, 2))
    except Exception:
        # Hata metni disari verilmiyor (baglanti adresi vb. icerebilir).
        return CheckResult(status="fail")


def check_memory() -> CheckResult:
    """Bellek kullanimi. Ayrinti (RSS, sistem yuzdesi) disari verilmiyor: uc kimliksiz."""
    return CheckResult(status="warn" if psutil.virtual_memory().percent > 90 else "pass")


@router.get("/live", status_code=status.HTTP_200_OK)
async def liveness_probe():
    """Liveness probe for Kubernetes/Docker."""
    return {"status": "ok"}


@router.get("/ready", response_model=HealthResponse)
@limiter.limit("20/minute")
async def readiness_probe(request: Request, response: Response):
    """Readiness probe checking dependencies."""
    database_result = await check_database()
    memory_result = check_memory()

    # overall status
    overall_status = "healthy"
    if database_result.status == "fail":
        overall_status = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif memory_result.status == "warn":
        overall_status = "degraded"

    return HealthResponse(
        status=overall_status,
        version=__version__,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        checks={"database": database_result, "memory": memory_result},
    )


@router.get("/startup")
async def startup_probe():
    """Startup probe confirming initialization."""
    return {"status": "started", "version": __version__}
