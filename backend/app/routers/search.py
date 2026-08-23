import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key, verify_api_key
from app.cache import build_cache_key, cache, get_ttl_for_type
from app.database import APIKey, GlobalState, Report, get_db
from app.geo import bbox_circumscribed_radius_m, snap_bbox_outward
from app.models import RADIUS_PRESETS, ReportRequest, SearchParams, SearchResponse
from app.overpass import OverpassError
from app.policy import SearchPolicyInput, decide_policy
from app.search_service import run_search_orchestration

logger = logging.getLogger(__name__)

router = APIRouter()

# Desteklenen arama turleri. Bilinmeyen bir tur sorgu olusturucuda bos
# filtre listesine dusuyordu: istek 200 donuyor ama sonuc hep bos
# kaliyordu. Kullanici bunu "veri yok" saniyordu; artik acikca reddediliyor.
SUPPORTED_TYPES = frozenset(RADIUS_PRESETS.keys())

# SearchParams modeli bu sinirlari zaten tanimliyor, ancak endpoint
# parametreleri Query(...) ile alindigi icin model dogrulamasi devreye
# girmiyordu. Sinirlar burada acikca uygulaniyor.
MIN_RADIUS_M = 100
MAX_RADIUS_M = 5000


def _parse_bbox(raw: str | None):
    """
    "minLon,minLat,maxLon,maxLat" -> (south, west, north, east)

    Dis API GeoJSON sirasini kullaniyor cunku istemciler bbox'i boyle
    tutuyor; ic konvansiyon (ve Overpass) ise south/west/north/east.
    Cevrim tek yerde, burada yapiliyor.
    """
    if raw is None:
        return None

    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise HTTPException(
            status_code=422,
            detail="bbox formati: minLon,minLat,maxLon,maxLat (4 sayi).",
        )

    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox degerleri sayi olmali.")

    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(
            status_code=422, detail="bbox enlemi -90..90 araliginda olmali."
        )
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        raise HTTPException(
            status_code=422, detail="bbox boylami -180..180 araliginda olmali."
        )
    if min_lat >= max_lat or min_lon >= max_lon:
        raise HTTPException(
            status_code=422,
            detail="bbox bos veya ters: min degerler max degerlerden kucuk olmali.",
        )

    # HAM bbox donuyor. Izgaraya oturtma bilincli olarak burada
    # yapilmiyor: snap bir onbellek optimizasyonu ve alani disari dogru
    # buyutuyor. Plan kontrolu once ham deger uzerinden yapilmali, yoksa
    # sinira uyan bir istek bizim optimizasyonumuz yuzunden reddedilir.
    return (min_lat, min_lon, max_lat, max_lon)


def _validate_search_input(place_type: str, radius: int | None) -> None:
    """Reject unsupported type / out-of-range radius with 422."""
    if place_type not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported type '{place_type}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_TYPES))}"
            ),
        )

    if radius is not None and not (MIN_RADIUS_M <= radius <= MAX_RADIUS_M):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Radius must be between {MIN_RADIUS_M} and {MAX_RADIUS_M} "
                f"meters (got {radius})."
            ),
        )


@router.get("/search", response_model=SearchResponse)
async def search_places(
    response: Response,
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    radius: int = Query(None, description="Radius (m)"),
    type: str = Query(..., description="Place category"),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    ref_lat: float = Query(None, ge=-90, le=90),
    ref_lon: float = Query(None, ge=-180, le=180),
    mode: str = Query("auto"),
    bbox: str = Query(
        None,
        description=(
            "Taranacak dikdortgen: minLon,minLat,maxLon,maxLat (GeoJSON sirasi). "
            "Verilirse radius ve mode yok sayilir."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
) -> SearchResponse:
    """
    Unified search with Plans, Confidence, and Grid Caching.

    `bbox` verildiginde tam olarak o dikdortgen taranir.

    Cagiran gercek bir goruntu alani biliyorsa bu belirgin sekilde daha
    ucuz. Viewport'u once cevrel cembere, sonra (bbox modunda) o cemberi
    tekrar dikdortgene cevirmek buyumeyi biriktiriyor; olculen degerler:
      zoom 14 viewport -> taranan alan 2.00x
      zoom 12 viewport -> taranan alan 2.59x
    """
    debug_mode = os.getenv("DEBUG_OVERPASS", "false").lower() == "true"

    # 0. Girdi dogrulamasi (plan kontrolunden once: gecersiz istek
    #    kullanicinin planiyla ilgili degil)
    _validate_search_input(type, radius)
    parsed_bbox = _parse_bbox(bbox)

    # 1. Plan Enforcement
    max_allowed_radius = 5000
    if api_key.plan == "free":
        max_allowed_radius = 2000

    if parsed_bbox is not None:
        # Plan siniri yaricap uzerinden tanimli; bbox'in esdeger yaricapi
        # (merkezden koseye) kullaniliyor ki bbox plan sinirini atlatmanin
        # yolu olmasin.
        current_radius = bbox_circumscribed_radius_m(parsed_bbox)
    else:
        current_radius = radius or 1500  # Default if None

    if current_radius > max_allowed_radius:
        detail = (
            f"Radius {current_radius}m exceeds plan limit "
            f"({max_allowed_radius}m) for '{api_key.plan}' plan."
        )
        if parsed_bbox is not None:
            detail = (
                f"Bbox alani plan sinirini asiyor: esdeger yaricap "
                f"{current_radius}m > {max_allowed_radius}m "
                f"('{api_key.plan}' plani). Daha dar bir alan secin."
            )
        raise HTTPException(status_code=403, detail=detail)

    # Plan kontrolu bittikten SONRA izgaraya oturtuluyor: onbellek
    # isabetini artiriyor (haritayi birkac piksel kaydiran kullanici ayni
    # sorguyu tetiklemesin) ama plan siniri ham istege gore uygulandi.
    query_bbox = snap_bbox_outward(parsed_bbox) if parsed_bbox else None

    # 2. Consult Search Policy
    if parsed_bbox is not None:
        # Acik bbox varken politika motorunun mod secmesine gerek yok:
        # taranacak alan zaten kesin olarak verilmis.
        eff_radius = current_radius
        eff_mode = "bbox"
    else:
        policy_input = SearchPolicyInput(
            type=type, lat=lat, lon=lon, radius=current_radius, mode=mode
        )
        decision = decide_policy(policy_input)
        eff_radius = decision.effective_radius
        eff_mode = decision.effective_mode

    # 3. Check Cache with Override Version Partitioning
    ov_query = select(GlobalState).where(GlobalState.key == "overrides_updated_at")
    ov_st = await db.execute(ov_query)
    ov_obj = ov_st.scalar_one_or_none()
    ov_ver = ov_obj.value if ov_obj else "0"

    # We cache based on effective params + current overrides version
    cache_key = build_cache_key(
        lat,
        lon,
        eff_radius,
        type,
        limit,
        ref_lat,
        ref_lon,
        eff_mode,
        ov_ver,
        bbox=query_bbox,
    )
    cached = cache.get(cache_key)
    if cached:
        if debug_mode:
            response.headers["X-Policy-Cache-Hit"] = "true"
            response.headers["X-Policy-Version"] = ov_ver

        return SearchResponse(
            results=cached[offset : offset + limit],
            count=len(cached),
            query=SearchParams(
                lat=lat,
                lon=lon,
                radius=eff_radius,
                type=type,
                limit=limit,
                offset=offset,
                ref_lat=ref_lat,
                ref_lon=ref_lon,
                mode=mode,
            ),
        )

    # 4. Execute Search Orchestration with Fallback
    results = []
    stage2_used = False

    # Acik bbox varken alternatif moda dusmek anlamsiz: cagiran taranacak
    # dikdortgeni kesin olarak vermis, "around" moduna gecmek baska bir
    # alani taramak olurdu.
    modes_to_try = [eff_mode]
    if parsed_bbox is None and decision.fallback_mode:
        modes_to_try.append(decision.fallback_mode)

    last_err = None
    applied_mode = eff_mode

    for attempt_mode in modes_to_try:
        try:
            applied_mode = attempt_mode
            results, stage2_used = await run_search_orchestration(
                mode=attempt_mode,
                radius=eff_radius,
                place_type=type,
                lat=lat,
                lon=lon,
                ref_lat=ref_lat,
                ref_lon=ref_lon,
                db=db,
                explicit_bbox=query_bbox,
            )
            # If we found something, break
            if results:
                break
        except OverpassError as e:
            last_err = e
            logger.warning(f"Search failed for mode {attempt_mode}: {str(e)}")
            continue
        except Exception as e:
            last_err = e
            logger.error(f"Unexpected search error in mode {attempt_mode}: {str(e)}")
            continue

    if not results and last_err:
        if isinstance(last_err, OverpassError):
            raise HTTPException(
                status_code=503,
                detail=f"Overpass API currently unavailable: {str(last_err)}",
            )
        raise HTTPException(
            status_code=500, detail=f"Search orchestration error: {str(last_err)}"
        )

    # 5. Sorting
    if ref_lat is not None and ref_lon is not None:
        results.sort(key=lambda p: p.distance_m or float("inf"))
    else:
        results.sort(key=lambda p: p.distance or float("inf"))

    # 6. Finalize & Cache
    cache.set(cache_key, results, get_ttl_for_type(type))

    if debug_mode:
        response.headers["X-Applied-Mode"] = applied_mode
        response.headers["X-Stage2-Used"] = str(stage2_used).lower()

    return SearchResponse(
        results=results[offset : offset + limit],
        count=len(results),
        query=SearchParams(
            lat=lat,
            lon=lon,
            radius=eff_radius,
            type=type,
            limit=limit,
            offset=offset,
            ref_lat=ref_lat,
            ref_lon=ref_lon,
            mode=applied_mode,
        ),
    )


@router.post("/report")
async def report_incorrect_data(
    request: ReportRequest,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Handle data quality reports by persisting to SQLite."""
    new_report = Report(
        place_id=request.place_id,
        shown_type=request.shown_type,
        correct_type=request.correct_type,
        lat=request.lat,
        lon=request.lon,
        name=request.name,
        notes=request.notes,
        client=request.client,
        app_version=request.app_version,
        ip="X-API-KEY:" + api_key.name,
    )
    db.add(new_report)
    await db.commit()
    return {"success": True, "message": "TeÅŸekkÃ¼rler, raporunuz incelenecektir."}
