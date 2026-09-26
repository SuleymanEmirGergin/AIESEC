"""Admin router for managing reports, overrides, and API keys."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_key, verify_admin_key
from app.cache import cache
from app.database import APIKey, GlobalState, Override, Report, get_db
from app.models import (
    APIKeyAdminResponse,
    APIKeyAdminUpdate,
    APIKeyCreateResponse,
    OverrideCreate,
    OverrideResponse,
    ReportDetailedResponse,
    ReportListResponse,
    ReportUpdateAdmin,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Cache Management (Existing) ---


@router.get("/cache/stats")
async def get_cache_stats(_: None = Depends(verify_admin_key)):
    """Get cache statistics."""
    return cache.get_stats()


@router.delete("/cache")
async def clear_cache(_: None = Depends(verify_admin_key)):
    """Clear all cache entries."""
    count = len(cache._cache)
    cache.clear()
    return {"message": "Cache cleared", "entries_cleared": count}


# --- Reports Management ---


@router.get("/reports", response_model=ReportListResponse)
async def list_reports(
    status: str = "open",
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """
    List user reports with filtering and pagination.

    Toplam kayit sayisi ayri bir COUNT sorgusuyla donuyor; onceden uc
    duz bir dizi donduruyordu ve istemci toplam sayfa sayisini
    tahmin etmek zorunda kaliyordu.

    status="all" tum durumlari kapsar. Onceden bu deger desteklenmedigi
    icin istemci parametreyi hic gondermiyor, uc de sessizce "open"a
    dusuyordu.
    """
    filters = [] if status == "all" else [Report.status == status]

    total = await db.scalar(select(func.count()).select_from(Report).where(*filters))

    result = await db.execute(
        select(Report)
        .where(*filters)
        .order_by(desc(Report.created_at))
        .limit(limit)
        .offset(offset)
    )

    # Duz dict donuluyor: ORM nesnelerini ReportDetailedResponse'a
    # cevirmeyi FastAPI'nin response_model'i yapiyor. Modeli elle
    # kurmak ORM nesnelerinde dogrulama hatasi veriyordu.
    return {"data": result.scalars().all(), "total": total or 0}


@router.get("/reports/{report_id}", response_model=ReportDetailedResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """Get full report details."""
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.patch("/reports/{report_id}", response_model=ReportDetailedResponse)
async def update_report(
    report_id: int,
    update_data: ReportUpdateAdmin,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """Update report status, notes, or tags."""
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(report, field, value)

    if update_data.status != "open":
        report.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.commit()
    await db.refresh(report)
    return report


# --- Overrides Management ---


@router.post("/overrides", response_model=OverrideResponse)
async def create_override(
    data: OverrideCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """Create a manual classification override."""
    # Check for existing
    existing = await db.execute(
        select(Override).where(Override.place_id == data.place_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Override already exists for this place_id"
        )

    new_override = Override(
        id=str(uuid.uuid4()),
        **data.model_dump(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(new_override)

    # Bump system version
    await db.execute(
        update(GlobalState)
        .where(GlobalState.key == "overrides_updated_at")
        .values(value=str(int(datetime.utcnow().timestamp())))
    )

    await db.commit()
    await db.refresh(new_override)
    return new_override


@router.get("/overrides", response_model=List[OverrideResponse])
async def list_overrides(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """List all active/inactive overrides."""
    result = await db.execute(select(Override).limit(limit))
    return result.scalars().all()


@router.delete("/overrides/{override_id}")
async def delete_override(
    override_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """Remove an override."""
    await db.execute(delete(Override).where(Override.id == override_id))
    await db.commit()
    return {"success": True}


# --- API Key Management ---


@router.post("/keys", response_model=APIKeyCreateResponse)
async def create_api_key(
    name: str,
    daily_limit: int = 500,
    plan: str = Query("free", pattern="^(free|pro|enterprise)$"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """Generate a new API key with a specific plan tier."""
    plain_key = f"ak_{secrets.token_urlsafe(32)}"
    key_h = hash_key(plain_key)

    new_key = APIKey(
        key_hash=key_h,
        name=name,
        daily_limit=daily_limit,
        plan=plan,
        last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    return {
        "name": new_key.name,
        "is_active": new_key.is_active,
        "daily_limit": new_key.daily_limit,
        "used_today": new_key.used_today,
        "last_reset_date": new_key.last_reset_date,
        "plan": new_key.plan,
        "key": plain_key,  # ONLY return plain key on creation
    }


@router.get("/keys", response_model=List[APIKeyAdminResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db), _: None = Depends(verify_admin_key)
):
    """
    Kayitli anahtarlari listeler (duz anahtar donmez, yalnizca ozet var).

    Bir hesabin planini degistirmek icin once id'sini bilmek gerekiyor;
    onceden uc yoktu ve id'yi ogrenmenin tek yolu SQLite dosyasini
    acmakti.
    """
    result = await db.execute(select(APIKey).order_by(APIKey.id))
    return result.scalars().all()


@router.patch("/keys/{key_id}", response_model=APIKeyAdminResponse)
async def update_api_key(
    key_id: int,
    data: APIKeyAdminUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_admin_key),
):
    """
    Mevcut bir anahtarin planini/kotasini/aktifligini gunceller.

    Anahtarin kendisi degismiyor: kullanicinin tarayicisinda ya da
    SEARCH_API_KEY'de duran deger gecerli kalir, yalnizca yetkileri
    degisir. Plan yukseltmesinin dogru yolu budur - yeni anahtar uretmek
    eskisini kullanan herkesi disarida birakirdi.
    """
    key_obj = await db.get(APIKey, key_id)
    if not key_obj:
        raise HTTPException(status_code=404, detail=f"API key {key_id} not found")

    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    for field, value in changes.items():
        setattr(key_obj, field, value)

    await db.commit()
    await db.refresh(key_obj)
    return key_obj


# --- Advanced Stats ---


@router.get("/stats")
async def get_enterprise_stats(
    db: AsyncSession = Depends(get_db), _: None = Depends(verify_admin_key)
):
    """Yonetim ozeti: son 7/30 gunun rapor sayisi ve en cok raporlanan yerler (30 gun)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    since_7, since_30 = now - timedelta(days=7), now - timedelta(days=30)

    async def count_since(since: datetime) -> int:
        return await db.scalar(select(func.count(Report.id)).where(Report.created_at >= since)) or 0

    dist = await db.execute(
        select(Report.shown_type, Report.correct_type, func.count(Report.id))
        .where(Report.created_at >= since_30)
        .group_by(Report.shown_type, Report.correct_type)
    )
    # Ad GROUP BY'da degil, max() ile: Postgres toplanmamis kolonu reddediyor
    # (SQLite etmiyordu, canlida 500 buradan geliyordu).
    count_col = func.count(Report.id).label("count")
    top = await db.execute(
        select(Report.place_id, func.max(Report.name).label("name"), count_col)
        .where(Report.created_at >= since_30)
        .group_by(Report.place_id)
        .order_by(count_col.desc(), Report.place_id)
        .limit(10)
    )

    return {
        "last_7_days": await count_since(since_7),
        "last_30_days": await count_since(since_30),
        "report_distribution": [{"from": r[0], "to": r[1], "count": r[2]} for r in dist],
        "top_reported_places": [{"place_id": r[0], "name": r[1], "count": r[2]} for r in top],
    }
