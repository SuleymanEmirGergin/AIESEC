"""Prometheus metrics router."""

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST


router = APIRouter(tags=["monitoring"])


@router.get("/metrics")
async def get_metrics():
    """
    Expose Prometheus metrics.
    
    Returns:
        Prometheus formatted metrics text
    """
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
