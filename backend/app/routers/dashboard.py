"""
Pano: ekibin ilerlemesi tek bakista.

Sayimlar ekip anahtarina (api_key_id) gore; baska ekibin verisi karismaz.
Haftalik seri Python'da kovalaniyor: tarih fonksiyonlari SQLite ile
Postgres'te farkli, bu olcekte (binlerce olay) fark etmiyor.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key
from app.database import APIKey, ContactEvent, PlaceList, SavedPlace, get_db

router = APIRouter()

WEEKS = 8
CLOSED = ("positive", "not_suitable")


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
) -> dict:
    today = datetime.now(timezone.utc).date()
    team = SavedPlace.api_key_id == api_key.id

    by_status = dict(
        (await db.execute(select(SavedPlace.contact_status, func.count()).where(team).group_by(SavedPlace.contact_status))).all()
    )
    saved = sum(by_status.values())
    open_follow = (SavedPlace.next_follow_up_at.is_not(None), SavedPlace.contact_status.not_in(CLOSED))
    overdue = await db.scalar(select(func.count()).where(team, *open_follow, SavedPlace.next_follow_up_at < today)) or 0
    due_today = await db.scalar(select(func.count()).where(team, *open_follow, SavedPlace.next_follow_up_at == today)) or 0
    unassigned = await db.scalar(select(func.count()).where(team, SavedPlace.assigned_to.is_(None))) or 0

    people: dict[str, dict] = defaultdict(lambda: {"saved": 0, "contacts": 0, "positive": 0, "assigned": 0})
    for name, n in (await db.execute(select(SavedPlace.saved_by, func.count()).where(team).group_by(SavedPlace.saved_by))).all():
        if name:
            people[name]["saved"] += n
    events = (
        select(ContactEvent.volunteer_name, ContactEvent.status, func.count())
        .join(SavedPlace, SavedPlace.id == ContactEvent.saved_place_id)
        .where(team)
        .group_by(ContactEvent.volunteer_name, ContactEvent.status)
    )
    for name, status, n in (await db.execute(events)).all():
        people[name]["contacts"] += n
        if status == "positive":
            people[name]["positive"] += n
    for name, n in (await db.execute(select(SavedPlace.assigned_name, func.count()).where(team, SavedPlace.assigned_name.is_not(None)).group_by(SavedPlace.assigned_name))).all():
        people[name]["assigned"] += n

    start = today - timedelta(days=today.weekday()) - timedelta(weeks=WEEKS - 1)
    weeks = {start + timedelta(weeks=i): 0 for i in range(WEEKS)}
    recent = await db.execute(
        select(ContactEvent.contacted_at)
        .join(SavedPlace, SavedPlace.id == ContactEvent.saved_place_id)
        .where(team, ContactEvent.contacted_at >= start)
    )
    for (day,) in recent.all():
        week = day - timedelta(days=day.weekday())
        if week in weeks:
            weeks[week] += 1

    lists = await db.execute(
        select(PlaceList.name, func.count(SavedPlace.id), func.count(SavedPlace.last_contact_at))
        .join(SavedPlace, SavedPlace.list_id == PlaceList.id)
        .where(team)
        .group_by(PlaceList.id, PlaceList.name)
        .order_by(func.count(SavedPlace.id).desc())
    )

    contacted = saved - by_status.get("uncontacted", 0)
    return {
        "totals": {
            "saved": saved,
            "contacted": contacted,
            "positive": by_status.get("positive", 0),
            "not_suitable": by_status.get("not_suitable", 0),
            "overdue": overdue,
            "due_today": due_today,
            "unassigned": unassigned,
        },
        "by_status": by_status,
        "by_person": sorted(
            ({"name": name, **values} for name, values in people.items()),
            key=lambda p: (-p["contacts"], -p["saved"], p["name"]),
        ),
        "weekly": [{"week_start": week.isoformat(), "count": n} for week, n in weeks.items()],
        "by_list": [{"name": name, "count": n, "contacted": c} for name, n, c in lists.all()],
        "generated_for": date.today().isoformat(),
    }


@router.get("/dashboard/due")
async def due_counts(
    me: str | None = Query(None, max_length=254),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
) -> dict:
    """Menudeki "Bugun" rozeti: gecikmis + bugun takipleri (kapanmislar haric)."""
    today = datetime.now(timezone.utc).date()
    base = (
        SavedPlace.api_key_id == api_key.id,
        SavedPlace.next_follow_up_at.is_not(None),
        SavedPlace.next_follow_up_at <= today,
        SavedPlace.contact_status.not_in(CLOSED),
    )
    overdue = await db.scalar(select(func.count()).where(*base, SavedPlace.next_follow_up_at < today)) or 0
    due_today = await db.scalar(select(func.count()).where(*base, SavedPlace.next_follow_up_at == today)) or 0
    mine = 0
    if me:
        mine = await db.scalar(select(func.count()).where(*base, SavedPlace.assigned_to == me.strip().lower())) or 0
    return {"overdue": overdue, "today": due_today, "mine": mine}
