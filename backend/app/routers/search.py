import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key, verify_api_key
from app.cache import build_cache_key, cache, get_ttl_for_type
from app.database import APIKey, GlobalState, Report, get_db
from app.models import ReportRequest, SearchParams, SearchResponse
from app.overpass import OverpassError
from app.policy import SearchPolicyInput, decide_policy
from app.search_service import run_search_orchestration

logger = logging.getLogger(__name__)

router = APIRouter()


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
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key)
) -> SearchResponse:
    """
    Unified search with Plans, Confidence, and Grid Caching.
    """
    debug_mode = os.getenv("DEBUG_OVERPASS", "false").lower() == "true"

    # 1. Plan Enforcement
    max_allowed_radius = 5000
    if api_key.plan == "free":
        max_allowed_radius = 2000
    
    current_radius = radius or 1500  # Default if None
    if current_radius > max_allowed_radius:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Radius {current_radius}m exceeds plan limit "
                f"({max_allowed_radius}m) for '{api_key.plan}' plan."
            )
        )

    # 2. Consult Search Policy
    policy_input = SearchPolicyInput(
        type=type, lat=lat, lon=lon, radius=current_radius, mode=mode
    )
    decision = decide_policy(policy_input)
    eff_radius = decision.effective_radius
    eff_mode = decision.effective_mode

    # 3. Check Cache with Override Version Partitioning
    ov_query = select(GlobalState).where(
        GlobalState.key == "overrides_updated_at"
    )
    ov_st = await db.execute(ov_query)
    ov_obj = ov_st.scalar_one_or_none()
    ov_ver = ov_obj.value if ov_obj else "0"
    
    # We cache based on effective params + current overrides version
    cache_key = build_cache_key(
        lat, lon, eff_radius, type, limit, ref_lat, ref_lon, eff_mode, ov_ver
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
                lat=lat, lon=lon, radius=eff_radius, type=type,
                limit=limit, offset=offset, ref_lat=ref_lat,
                ref_lon=ref_lon, mode=mode
            )
        )

    # 4. Execute Search Orchestration with Fallback
    results = []
    stage2_used = False
    
    modes_to_try = [eff_mode]
    if decision.fallback_mode:
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
                db=db
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
                detail=f"Overpass API currently unavailable: {str(last_err)}"
            )
        raise HTTPException(
            status_code=500,
            detail=f"Search orchestration error: {str(last_err)}"
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
            lat=lat, lon=lon, radius=eff_radius, type=type,
            limit=limit, offset=offset, ref_lat=ref_lat,
            ref_lon=ref_lon, mode=applied_mode
        )
    )


@router.post("/report")
async def report_incorrect_data(
    request: ReportRequest,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key)
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
        ip="X-API-KEY:" + api_key.name
    )
    db.add(new_report)
    await db.commit()
    return {"success": True, "message": "Teşekkürler, raporunuz incelenecektir."}
