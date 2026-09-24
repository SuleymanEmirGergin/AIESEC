"""Router for lead export functionality."""

import csv
import io
import re
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


# Excel, Turkce yerelde liste ayiracini ';' olarak okuyor; virgulle
# ayrilmis dosya tek sutuna yigiliyor. Dosyanin ilk hedefi Excel.
CSV_DELIMITER = ";"

# Arayuzdeki src/lib/labels.ts ile ayni; kullanici teknik olmayan gonullu,
# CSV'de "kindergarten" degil "Anaokulu" gormeli.
TYPE_LABELS = {
    "factory": "Fabrika",
    "office": "Ofis",
    "workshop": "Atölye",
    "kindergarten": "Anaokulu",
    "primary_school": "İlkokul",
    "middle_school": "Ortaokul",
    "high_school": "Lise",
    "private_school": "Özel Okul",
    "college_keyword": "Kolej",
    "college_university": "Üniversite",
    "hotel": "Otel",
    "company": "Şirket",
    "holding": "Holding",
    "real_estate": "Emlak Ofisi",
    "language_school": "Dil Kursu",
    "travel_agency": "Seyahat Acentesi",
    "zoo_aquarium": "Hayvanat Bahçesi & Akvaryum",
    "theme_park": "Tema & Su Parkı",
    "museum": "Müze",
    "botanical_garden": "Botanik Bahçesi",
    "nature_park": "Milli Park & Doğa Alanı",
}

# Arayuzde bos adres bu metinle gosteriliyor; CSV'ye tasinmamali.
EMPTY_ADDRESS = "Adres bilgisi yok"

CSV_HEADER = [
    "Ad",
    "Tür",
    "Telefon",
    "E-posta",
    "Web Sitesi",
    "Adres",
    "Konum",
    "Harita",
    "Kayıt No",
]


def format_phone(raw: str) -> str:
    """
    Telefonu okunur ve Excel'in sayi sanmayacagi bicime getirir.

    "+905424703486" Excel'de 9,05E+11 oluyor. Bosluklu yazim hem gozle
    okunur hem de metin olarak kalir. Turk numaralari (+90 / 0 onekli,
    10 hane) "+90 542 470 34 86" seklinde; taninmayanlar oldugu gibi.
    """
    raw = raw.strip()
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("90") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        return f"+90 {digits[:3]} {digits[3:6]} {digits[6:8]} {digits[8:]}"
    return raw


def build_csv(items: List[Dict[str, Any]]) -> str:
    """Construct CSV string from OSM items."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=CSV_DELIMITER)
    writer.writerow(CSV_HEADER)

    for item in items:
        tags = item.get("tags", {}) or {}
        lat, lon = item.get("lat"), item.get("lon")
        # Tek hucre metin: Turkce Excel "28.86" degerini binlik ayirac
        # sanip bozuyor; "41.030743, 28.860546" ise oldugu gibi kalir ve
        # dogrudan haritaya yapistirilabilir.
        has_coords = isinstance(lat, (int, float)) and isinstance(lon, (int, float))
        location = f"{lat:.6f}, {lon:.6f}" if has_coords else ""
        maps_url = f"https://www.google.com/maps?q={lat:.6f},{lon:.6f}" if has_coords else ""
        address = (item.get("address") or tags.get("addr:full") or "").strip()
        if address == EMPTY_ADDRESS:
            address = ""
        place_type = item.get("type") or ""
        writer.writerow(
            [
                item.get("name") or "",
                TYPE_LABELS.get(place_type, place_type),
                format_phone(pick_tag(tags, PHONE_KEYS)),
                pick_tag(tags, EMAIL_KEYS),
                pick_tag(tags, WEBSITE_KEYS),
                address,
                location,
                maps_url,
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
