"""Router for lead export functionality."""

import csv
import io
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_api_key
from app.database import APIKey, ExportLog, get_db
from app.models import ExportRequest

router = APIRouter(prefix="/api", tags=["export"])


# OSM iletisim bilgisini iki semayla tutuyor: duz (`phone`) ve `contact:`
# onekli (`contact:phone`). Sira oncelik demek. Ayni oncelik listesi
# arayuzde src/lib/contact.ts icinde yasiyor; ikisi ayni sonucu vermeli,
# yoksa kullanici ekranda gordugu numarayi CSV'de bulamaz.
PHONE_KEYS = ("phone", "contact:phone", "telephone", "contact:mobile", "mobile")
EMAIL_KEYS = ("email", "contact:email")
WEBSITE_KEYS = ("website", "contact:website", "url", "contact:url")


def pick_tag(tags: Dict[str, Any], keys: tuple) -> str:
    """Return the first non-empty tag value following the given priority."""
    for key in keys:
        value = (tags.get(key) or "").strip()
        if value:
            return value
    return ""


def build_csv(items: List[Dict[str, Any]]) -> str:
    """Construct CSV string from OSM items."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    writer.writerow(
        [
            "name",
            "type",
            "subtype",
            "lat",
            "lon",
            "city",
            "district",
            "street",
            "phone",
            "email",
            "website",
            "osm_id",
        ]
    )

    for item in items:
        tags = item.get("tags", {}) or {}
        writer.writerow(
            [
                item.get("name") or "",
                item.get("type") or "",
                item.get("subtype") or "",
                item.get("lat"),
                item.get("lon"),
                tags.get("addr:city") or "",
                tags.get("addr:district") or tags.get("addr:suburb") or "",
                tags.get("addr:street") or "",
                pick_tag(tags, PHONE_KEYS),
                pick_tag(tags, EMAIL_KEYS),
                pick_tag(tags, WEBSITE_KEYS),
                item.get("id") or "",
            ]
        )

    return output.getvalue()


@router.post("/export")
async def export_leads(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
):
    """
    Export search results as CSV.
    Consumes 2 API quota units. Disallowed for 'free' plans.
    """
    # 1. Plan Enforcement
    if api_key.plan == "free":
        raise HTTPException(
            status_code=403,
            detail=f"CSV Export is disabled for '{api_key.plan}' plan. Please upgrade to Pro or Enterprise.",
        )

    # 2. Increment additional quota (middleware already did 1)
    if api_key.used_today >= api_key.daily_limit:
        raise HTTPException(
            status_code=429, detail="Daily quota exceeded for export (2 units)"
        )
    api_key.used_today += 1  # Total 2

    # 3. Log export
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

    # 4. Build CSV
    #
    # BOM sart: Excel BOM'suz bir CSV'yi Windows'ta sistem kod sayfasiyla
    # aciyor ve Turkce karakterler bozuluyor ("Istanbul" -> "Ä°stanbul").
    # Dosyanin ilk hedefi Excel oldugu icin BOM'u biz ekliyoruz.
    csv_data = "\ufeff" + build_csv(request.items)

    # Dosya adi istek govdesinden geliyor; tirnak ya da satir sonu iceren
    # bir deger Content-Disposition basligini bolebilir. Guvenli alfabeye
    # indirgiyoruz.
    safe_type = "".join(c for c in request.type if c.isalnum() or c in "-_") or "export"

    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="leads_{safe_type}.csv"'
        },
    )
