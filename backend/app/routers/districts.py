"""
Ilce endpoint'leri.

Sorgu uclari (GET) tamamen yerel: districts.geojson + SQLite. Overpass'e
yalnizca talep uzerine ingest (POST) gidiyor -- bu modulde Overpass'e
giden TEK yol trigger_ingest.

Kimlik: sinir verisi (metadata + geojson) acik, cunku harita cizimi icin
gerekli statik bir varlik ve kisisel veri icermiyor. POI donen iki uc
(summary, places) `validate_api_key` kullaniyor -- anahtari dogruluyor
ama kota harcamiyor: bu sorgularin dis maliyeti sifir, kota saymak
yanlis olurdu. Ingest ucu tek istisna: gercekten Overpass'e gidiyor, bu
yuzden kota harcayan `verify_api_key` kullaniyor.
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key, verify_api_key
from app.database import APIKey, get_db
from app.districts import (
    DEFAULT_BUFFER_M,
    all_districts,
    get_district,
    raw_geojson,
)
from app.ingest import FRESH_AFTER_DAYS, ingest_district
from app.overture_ingest import ingest_overture_district
from app.queries import ALL_TYPES, VALID_SORTS, PlaceFilter, count_by_type, fetch_places
from app.store import get_ingest_state, ingest_states

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/districts", tags=["districts"])

# Sinir verisi elle uretiliyor ve nadiren degisiyor; tarayici uzun sure
# tutabilir. GeoJSON'a `immutable` de veriliyor cunku icerigi degisirse
# dosya zaten yeniden uretilip deploy ediliyor.
# private: veri durumu degisiyor, Vercel CDN'i saklamasin (yalniz tarayici, 5 dk).
METADATA_CACHE = "private, max-age=300"
GEOJSON_CACHE = "public, max-age=604800, immutable"


def _require_district(district_id: str):
    """
    Ilceyi getir; kapsam disiysa 422.

    Kapsam disi ilce icin Overpass'e hic gidilmiyor -- maliyet
    tavaninin kilidi bu kontrol. Eskiden places ve summary'de ayri ayri
    yazilmisti (ve ikisi de yanlislikla 404 donuyordu); tek kontrol
    noktasina indirgenince bu tur bir sapma bir daha tek yerde onlenir.
    """
    district = get_district(district_id)
    if district is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Kapsam disi veya bilinmeyen ilce: {district_id}. "
                f"Kapsam: Istanbul, Edirne, Tekirdag, Kirklareli, Malatya."
            ),
        )
    return district


def _ingest_info(state) -> dict | None:
    """Ingest durumunu arayuzun bekledigi ic ice sekle cevirir."""
    if state is None:
        return None

    age = datetime.now(timezone.utc).replace(tzinfo=None) - state.fetched_at
    return {
        "fetched_at": state.fetched_at.isoformat(),
        "place_count": state.place_count,
        "status": state.status,
        "age_days": age.days,
        # Otomatik tazeleme yok; arayuz bu bayrakla hatirlatma gosteriyor.
        # FRESH_AFTER_DAYS tek tanim: frontend kendi kopyasini tutmuyor.
        "stale": age > timedelta(days=FRESH_AFTER_DAYS),
    }


def _parse_types(raw: str | None) -> tuple[str, ...]:
    """
    'factory,office' -> ('factory', 'office'). Bilinmeyen tur 422.

    Sessizce yok saymak yerine reddediliyor: yazim hatasi yapan
    kullanici bos sonuc gorup "bu ilcede yok" sanardi.
    """
    if not raw:
        return ()

    requested = tuple(t.strip() for t in raw.split(",") if t.strip())
    unknown = [t for t in requested if t not in ALL_TYPES]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Bilinmeyen tur: {', '.join(unknown)}. Gecerli: {', '.join(ALL_TYPES)}",
        )
    return requested


def _to_client_place(row) -> dict:
    """
    PlaceRow'u arayuzun bekledigi sekle cevirir.

    is_inside, fetch_places'in join'den tasidigi PlaceDistrict.is_inside
    degeri (bkz. queries.py): include_buffer=true iken donen bir kaydin
    kesin sinir mi tampon mu oldugunu bu deger olmadan ayirt edemeyiz.
    """
    return {
        "id": row.id,
        "name": row.name,
        "type": row.place_type,
        "lat": row.lat,
        "lon": row.lon,
        "address": row.address,
        "phone": row.phone,
        "email": row.email,
        "website": row.website,
        "confidence": row.confidence,
        "has_contact": bool(row.has_contact),
        "is_inside": bool(row.is_inside),
        "tags": json.loads(row.tags_json or "{}"),
    }


@router.get("")
async def list_districts(
    response: Response, db: AsyncSession = Depends(get_db)
) -> dict:
    """Kapsamdaki 80 ilcenin metadata'si (poligonsuz, ~8 KB)."""
    response.headers["Cache-Control"] = METADATA_CACHE

    states = await ingest_states(db)
    return {
        "districts": [
            {
                "id": d.id,
                "name": d.name,
                "province": d.province,
                "province_plate": d.province_plate,
                "center": list(d.center),
                "bbox": list(d.bbox),
                "ingest": _ingest_info(states.get(d.id)),
            }
            for d in all_districts()
        ]
    }


@router.get("/geojson")
async def district_geojson(response: Response) -> dict:
    """
    Ilce poligonlari (~500 KB - 1 MB).

    Sinir verisi degismiyor; uzun cache omru veriliyor ki tarayici
    her acilista yeniden indirmesin.
    """
    response.headers["Cache-Control"] = GEOJSON_CACHE
    try:
        return raw_geojson()
    except FileNotFoundError as exc:
        # Sinir verisi uretilmemis: bu bir yapilandirma eksigi, sunucu
        # hatasi degil. Mesaj ne yapilmasi gerektigini soyluyor.
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{district_id}/summary")
async def district_summary(
    district_id: str,
    include_buffer: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _: APIKey = Depends(validate_api_key),
) -> dict:
    """
    Tur basina kayit sayisi. Arayuzdeki chip sayilarini besliyor.
    10 turun hepsi anahtar olarak donuyor, sifir olanlar dahil.
    """
    district = _require_district(district_id)
    counts = await count_by_type(db, district_id, include_buffer)

    return {
        "district_id": district_id,
        "name": district.name,
        "counts": counts,
        "total": sum(counts.values()),
        "ingest": _ingest_info(await get_ingest_state(db, district_id)),
    }


@router.get("/{district_id}/places")
async def district_places(
    district_id: str,
    types: str = Query(None, description="Virgulle ayrilmis tur listesi; bos = hepsi"),
    has_contact: bool = Query(False),
    named_only: bool = Query(False),
    min_confidence: int = Query(0, ge=0, le=100),
    q: str = Query(None, description="Isim icinde arama"),
    include_buffer: bool = Query(True, description="2 km tampon bolgesi dahil"),
    include_unclassified: bool = Query(False),
    sort: str = Query("contact_first"),
    ref_lat: float = Query(None, ge=-90, le=90),
    ref_lon: float = Query(None, ge=-180, le=180),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: APIKey = Depends(validate_api_key),
) -> dict:
    """
    Filtrelenmis ve siralanmis POI listesi. Tamamen yerel SQL;
    Overpass'e gidilmiyor.
    """
    _require_district(district_id)

    if sort not in VALID_SORTS:
        raise HTTPException(
            status_code=422,
            detail=f"Gecersiz siralama: {sort}. Gecerli: {', '.join(sorted(VALID_SORTS))}",
        )

    place_filter = PlaceFilter(
        district_id=district_id,
        types=_parse_types(types),
        has_contact=has_contact,
        named_only=named_only,
        min_confidence=min_confidence,
        q=q,
        include_buffer=include_buffer,
        include_unclassified=include_unclassified,
        sort=sort,
        ref_lat=ref_lat,
        ref_lon=ref_lon,
        limit=limit,
        offset=offset,
    )

    rows, total = await fetch_places(db, place_filter)

    return {
        "results": [_to_client_place(r) for r in rows],
        "count": len(rows),
        "total": total,
        "query": {
            "district_id": district_id,
            "types": list(place_filter.types),
            "sort": sort,
            "limit": limit,
            "offset": offset,
        },
    }


@router.post("/{district_id}/ingest")
async def trigger_ingest(
    district_id: str,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
) -> dict:
    """
    Talep uzerine ingest.

    Bu, modulun Overpass'e giden TEK ucu. Haritada henuz cekilmemis bir
    ilceye tiklandiginda veya kullanici "Yenile" dediginde cagriliyor.
    Ilce basina 4 sorgu. Diger uclarin aksine kota harcayan
    verify_api_key kullaniyor: bu, gercek dis maliyeti olan tek uc.
    """
    _require_district(district_id)

    result = await ingest_district(db, district_id, DEFAULT_BUFFER_M, force)

    return {
        "district_id": result.district_id,
        "place_count": result.place_count,
        "query_count": result.query_count,
        "status": result.status,
        "skipped": result.skipped,
    }


@router.post("/{district_id}/enrich")
async def trigger_enrich(
    district_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
) -> dict:
    """
    Ilceyi Overture Maps ile zenginlestir.

    Ingest'ten AYRI bir uc: farkli kaynak, farkli maliyet ve farkli
    yenileme dongusu. Overpass ingest'i Overture'i beklemek zorunda
    kalmasin, Overture yenilemesi de Overpass kotasini harcamasin diye
    birlestirilmedi.

    Overture S3'te ucretsiz ve lisansi (CDLA Permissive 2.0) kalici
    saklamaya izin veriyor; yine de dis kaynak oldugu icin kota
    harcayan verify_api_key kullaniliyor.
    """
    _require_district(district_id)

    result = await ingest_overture_district(db, district_id, DEFAULT_BUFFER_M)

    return {
        "district_id": result.district_id,
        "fetched": result.fetched,
        "enriched": result.enriched,
        "inserted": result.inserted,
        "skipped_unmapped": result.skipped_unmapped,
    }
