"""Router for lead export functionality."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_api_key
from app.database import APIKey, ExportLog, get_db
from app.export_formats import (  # noqa: F401 - testler bunlari buradan aliyor
    CSV_HEADER,
    TYPE_LABELS,
    build_csv,
    format_phone,
    pick_tag,
    to_csv,
    to_pdf,
    to_xlsx,
)
from app.models import ExportRequest

router = APIRouter(prefix="/api", tags=["export"])

MEDIA_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


@router.post("/export")
async def export_leads(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
):
    """
    Export as CSV, Excel or PDF (`format`).
    """
    # 1. Log export
    log = ExportLog(
        ip="X-API-KEY:" + api_key.name,
        client="api",
        type=request.type,
        radius=request.radius,
        center_lat=request.center.get("lat", 0),
        center_lon=request.center.get("lon", 0),
        item_count=len(request.items),
    )
    db.add(log)
    await db.commit()

    # 2. Build file
    now = datetime.now(timezone.utc)
    title = (request.title or "").strip() or "Kayıtlı yerler"
    if request.format == "xlsx":
        content = to_xlsx(request.items, title, now)
    elif request.format == "pdf":
        content = to_pdf(request.items, title, now)
    else:
        content = to_csv(request.items)

    # Dosya adi istek govdesinden geliyor; tirnak ya da satir sonu iceren
    # bir deger Content-Disposition basligini bolebilir. Guvenli alfabeye
    # indirgiyoruz.
    safe_type = "".join(c for c in request.type if c.isalnum() or c in "-_") or "export"

    return Response(
        content=content,
        media_type=MEDIA_TYPES[request.format],
        headers={
            "Content-Disposition": f'attachment; filename="leads_{safe_type}.{request.format}"'
        },
    )
