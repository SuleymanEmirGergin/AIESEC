"""
Kayitli yerler, listeler ve disa aktarim gecmisi.

Neden var: uygulamada bulunan bir yerin uygulamanin icinde yasayabilecegi
hicbir yer yoktu. Secim yalnizca istemcinin React state'indeydi; sayfa
yenilenince gidiyordu ve tek cikis CSV indirmekti. Gonullunun emek verdigi
sey kalici olmali (bkz. PRODUCT.md ilke 1).

Sahiplik API anahtari uzerinden. Uygulama kisisel anahtar yoksa sunucunun
anahtarina dustugu icin varsayilan davranis "tum ekip ayni listeleri
paylasir" oluyor.

Kota: bu uclarin hicbiri kota harcamiyor (`validate_api_key`, `verify_api_key`
degil). Kaydetmek bir arama degil; gonullu bir yeri kaydettigi icin
gunluk hakkini kaybetmemeli.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key
from app.database import APIKey, ContactEvent, ExportLog, PlaceList, SavedPlace, get_db
from app.models import (
    ContactEventCreate,
    ContactEventResponse,
    ExportHistoryItem,
    PlaceListCreate,
    PlaceListResponse,
    PlaceListUpdate,
    SavedPlaceBulkCreate,
    SavedPlaceBulkResponse,
    SavedPlaceCreate,
    SavedPlaceResponse,
    SavedPlaceUpdate,
)

router = APIRouter(prefix="/api", tags=["saved"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _volunteer_name(x_volunteer_name: str | None = Header(None)) -> str:
    name = (x_volunteer_name or "").strip()
    if not name or len(name) > 120:
        raise HTTPException(
            status_code=422,
            detail="Gönüllü adı gerekli ve en fazla 120 karakter olmalı.",
        )
    return name


# --- Listeler ---------------------------------------------------------------


@router.get("/lists", response_model=List[PlaceListResponse])
async def list_place_lists(
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """
    Anahtara ait listeler, her birinin yer sayisiyla.

    Sayim tek sorguda outer join ile yapiliyor; liste basina ayri bir
    COUNT atmak N+1 demekti ve arayuz listeleri hep birlikte gosteriyor.
    """
    stmt = (
        select(PlaceList, func.count(SavedPlace.id))
        .outerjoin(SavedPlace, SavedPlace.list_id == PlaceList.id)
        .where(PlaceList.api_key_id == api_key.id)
        .group_by(PlaceList.id)
        .order_by(desc(PlaceList.updated_at))
    )
    rows = await db.execute(stmt)

    return [
        PlaceListResponse(
            id=lst.id,
            name=lst.name,
            note=lst.note,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
            created_by=lst.created_by,
            place_count=count,
        )
        for lst, count in rows.all()
    ]


@router.post("/lists", response_model=PlaceListResponse, status_code=201)
async def create_place_list(
    data: PlaceListCreate,
    volunteer_name: str = Depends(_volunteer_name),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Yeni liste olustur."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Liste adi bos olamaz.")

    now = _now()
    new_list = PlaceList(
        id=str(uuid.uuid4()),
        api_key_id=api_key.id,
        name=name,
        note=(data.note or "").strip() or None,
        created_at=now,
        updated_at=now,
        created_by=volunteer_name,
    )
    db.add(new_list)
    await db.commit()
    await db.refresh(new_list)

    return PlaceListResponse(
        id=new_list.id,
        name=new_list.name,
        note=new_list.note,
        created_at=new_list.created_at,
        updated_at=new_list.updated_at,
        created_by=new_list.created_by,
        place_count=0,
    )


async def _owned_list(list_id: str, api_key: APIKey, db: AsyncSession) -> PlaceList:
    """
    Listeyi getirir ama yalnizca cagiranin anahtarina aitse.

    Sahiplik filtresi sorgunun icinde: id'yle getirip sonra kontrol etmek,
    baskasinin listesinin var oldugunu 404 yerine 403 ile sizdirirdi.
    """
    result = await db.execute(
        select(PlaceList).where(
            PlaceList.id == list_id, PlaceList.api_key_id == api_key.id
        )
    )
    lst = result.scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadi.")
    return lst


@router.patch("/lists/{list_id}", response_model=PlaceListResponse)
async def update_place_list(
    list_id: str,
    data: PlaceListUpdate,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Liste adini ya da notunu degistir."""
    lst = await _owned_list(list_id, api_key, db)

    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Liste adi bos olamaz.")
        lst.name = name
    if "note" in changes:
        lst.note = (changes["note"] or "").strip() or None

    await db.commit()
    await db.refresh(lst)

    count = await db.scalar(
        select(func.count()).select_from(SavedPlace).where(SavedPlace.list_id == lst.id)
    )
    return PlaceListResponse(
        id=lst.id,
        name=lst.name,
        note=lst.note,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
        created_by=lst.created_by,
        place_count=count or 0,
    )


@router.delete("/lists/{list_id}")
async def delete_place_list(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """
    Listeyi sil. Icindeki yerler SILINMEZ, dosyalanmamisa duser.

    Gonullunun bulmak icin emek verdigi kayitlari bir liste adi
    degistirirken kaybetmesi kabul edilemez (PRODUCT.md ilke 1). Liste bir
    klasor, cop kutusu degil.
    """
    lst = await _owned_list(list_id, api_key, db)

    result = await db.execute(select(SavedPlace).where(SavedPlace.list_id == lst.id))
    released = result.scalars().all()
    for place in released:
        place.list_id = None

    await db.delete(lst)
    await db.commit()

    return {"success": True, "released_places": len(released)}


# --- Kayitli yerler ---------------------------------------------------------


@router.get("/saved", response_model=List[SavedPlaceResponse])
async def list_saved_places(
    list_id: Optional[str] = Query(
        None, description="Belirli bir liste. 'unfiled' dosyalanmamislari verir."
    ),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Kaydedilmis yerler; istege bagli olarak tek bir listeden."""
    filters = [SavedPlace.api_key_id == api_key.id]
    if list_id == "unfiled":
        filters.append(SavedPlace.list_id.is_(None))
    elif list_id:
        filters.append(SavedPlace.list_id == list_id)

    result = await db.execute(
        select(SavedPlace).where(*filters).order_by(desc(SavedPlace.created_at))
    )
    return result.scalars().all()


@router.post("/saved", response_model=SavedPlaceResponse, status_code=201)
async def save_place(
    data: SavedPlaceCreate,
    x_volunteer_name: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """
    Bir yeri kaydet.

    Ayni yer zaten kayitliysa hata degil, mevcut kayit donuyor (idempotent).
    Gonullu bir yeri iki kez kaydetmeye calistiginda hata gormemeli;
    "zaten kayitli" bir basari durumudur.
    """
    existing = await db.execute(
        select(SavedPlace).where(
            SavedPlace.api_key_id == api_key.id,
            SavedPlace.place_id == data.place_id,
        )
    )
    already = existing.scalar_one_or_none()
    if already:
        # Liste belirtildiyse mevcut kaydi oraya tasi - kullanicinin niyeti bu.
        if data.list_id and already.list_id != data.list_id:
            await _owned_list(data.list_id, api_key, db)
            already.list_id = data.list_id
            await db.commit()
            await db.refresh(already)
        return already

    if data.list_id:
        await _owned_list(data.list_id, api_key, db)

    volunteer_name = _volunteer_name(x_volunteer_name)
    place = SavedPlace(
        id=str(uuid.uuid4()),
        api_key_id=api_key.id,
        list_id=data.list_id,
        place_id=data.place_id,
        name=data.name,
        place_type=data.place_type,
        lat=data.lat,
        lon=data.lon,
        address=data.address,
        tags=data.tags or {},
        note=(data.note or "").strip() or None,
        saved_by=volunteer_name,
        created_at=_now(),
    )
    db.add(place)
    await db.commit()
    await db.refresh(place)
    return place


# SQLite tek sorguda en fazla 32766 parametre kabul ediyor; IN listesi parcali.
_IN_CHUNK = 500


@router.post("/saved/bulk", response_model=SavedPlaceBulkResponse)
async def save_places_bulk(
    data: SavedPlaceBulkCreate,
    x_volunteer_name: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """
    Birden cok yeri tek istekte, tek islemde kaydet.

    Tekli uctaki kurallar aynen gecerli: zaten kayitli olan hata degil,
    mevcut id donuyor; gonullu adi yalnizca yeni kayit varsa gerekli;
    liste verildiyse zaten kayitli olanlar da oraya tasiniyor (niyet bu).
    Ayni istekte tekrar eden yer bir kez kaydediliyor.
    """
    if data.list_id:
        await _owned_list(data.list_id, api_key, db)

    items = {item.place_id: item for item in data.items}
    place_ids = list(items)

    ids: dict[str, str] = {}
    for start in range(0, len(place_ids), _IN_CHUNK):
        chunk = place_ids[start : start + _IN_CHUNK]
        rows = await db.execute(
            select(SavedPlace.place_id, SavedPlace.id).where(
                SavedPlace.api_key_id == api_key.id, SavedPlace.place_id.in_(chunk)
            )
        )
        ids.update(dict(rows.all()))

    if data.list_id and ids:
        existing = list(ids)
        for start in range(0, len(existing), _IN_CHUNK):
            await db.execute(
                update(SavedPlace)
                .where(
                    SavedPlace.api_key_id == api_key.id,
                    SavedPlace.place_id.in_(existing[start : start + _IN_CHUNK]),
                )
                .values(list_id=data.list_id)
            )

    missing = [pid for pid in place_ids if pid not in ids]
    if missing:
        volunteer_name = _volunteer_name(x_volunteer_name)
        now = _now()
        new_places = [
            SavedPlace(
                id=str(uuid.uuid4()),
                api_key_id=api_key.id,
                list_id=data.list_id,
                place_id=pid,
                name=items[pid].name,
                place_type=items[pid].place_type,
                lat=items[pid].lat,
                lon=items[pid].lon,
                address=items[pid].address,
                tags=items[pid].tags or {},
                saved_by=volunteer_name,
                created_at=now,
            )
            for pid in missing
        ]
        # Id'ler burada uretildi; commit sonrasi nesneye dokunmaya gerek yok.
        ids.update({p.place_id: p.id for p in new_places})
        db.add_all(new_places)

    # Tek commit: yalnizca tasima olsa bile (hepsi zaten kayitli) yazilmali.
    await db.commit()
    return {"created": len(missing), "ids": ids}


async def _owned_place(place_id: str, api_key: APIKey, db: AsyncSession) -> SavedPlace:
    result = await db.execute(
        select(SavedPlace).where(
            SavedPlace.id == place_id, SavedPlace.api_key_id == api_key.id
        )
    )
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Kayit bulunamadi.")
    return place


@router.patch("/saved/{saved_id}", response_model=SavedPlaceResponse)
async def update_saved_place(
    saved_id: str,
    data: SavedPlaceUpdate,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Not ekle ya da baska bir listeye tasi."""
    place = await _owned_place(saved_id, api_key, db)

    # exclude_unset sart: `list_id: null` "dosyalanmamisa tasi" demek,
    # alanin hic gonderilmemesiyle ayni sey degil.
    changes = data.model_dump(exclude_unset=True)

    if "note" in changes:
        place.note = (changes["note"] or "").strip() or None
    if "list_id" in changes:
        target = changes["list_id"]
        if target:
            await _owned_list(target, api_key, db)
        place.list_id = target or None

    await db.commit()
    await db.refresh(place)
    return place


@router.delete("/saved/{saved_id}")
async def delete_saved_place(
    saved_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Kaydi kaldir."""
    place = await _owned_place(saved_id, api_key, db)
    await db.execute(
        delete(ContactEvent).where(ContactEvent.saved_place_id == place.id)
    )
    await db.delete(place)
    await db.commit()
    return {"success": True}


# --- Temas gecmisi ----------------------------------------------------------


@router.post(
    "/saved/{saved_id}/contacts", response_model=SavedPlaceResponse, status_code=201
)
async def create_contact_event(
    saved_id: str,
    data: ContactEventCreate,
    volunteer_name: str = Depends(_volunteer_name),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Temasi gecmise ekle ve kaydin guncel temas durumunu yenile."""
    place = await _owned_place(saved_id, api_key, db)
    db.add(
        ContactEvent(
            id=str(uuid.uuid4()),
            saved_place_id=place.id,
            status=data.status.value,
            contacted_at=data.contacted_at,
            note=(data.note or "").strip() or None,
            next_follow_up_at=data.next_follow_up_at,
            volunteer_name=volunteer_name,
            created_at=_now(),
        )
    )
    place.contact_status = data.status.value
    place.last_contact_at = data.contacted_at
    place.next_follow_up_at = data.next_follow_up_at
    await db.commit()
    await db.refresh(place)
    return place


@router.get("/saved/{saved_id}/contacts", response_model=List[ContactEventResponse])
async def list_contact_events(
    saved_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """Kayda ait temas gecmisini en yeni olaydan baslayarak getir."""
    place = await _owned_place(saved_id, api_key, db)
    result = await db.execute(
        select(ContactEvent)
        .where(ContactEvent.saved_place_id == place.id)
        .order_by(desc(ContactEvent.contacted_at), desc(ContactEvent.created_at))
    )
    return result.scalars().all()


# --- Disa aktarim gecmisi ---------------------------------------------------


@router.get("/exports", response_model=List[ExportHistoryItem])
async def list_export_history(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    """
    Bu anahtarla alinmis CSV'lerin gecmisi.

    ExportLog tablosu bastan beri yaziliyordu ama hicbir uc onu
    okumuyordu - veri birikiyor, kimse goremiyordu.

    Anahtar eslesmesi `ip` alani uzerinden: export.py o alana
    `"X-API-KEY:{ad}"` yaziyor. Ayri bir api_key_id sutunu daha temiz
    olurdu ama tablo zaten dolu ve projede migration araci yok
    (`create_all` yalnizca eksik TABLOLARI yaratir, mevcut tabloya sutun
    eklemez). Bu yuzden mevcut alanla eslestiriliyor.
    """
    marker = f"X-API-KEY:{api_key.name}"
    result = await db.execute(
        select(ExportLog)
        .where(ExportLog.ip == marker)
        .order_by(desc(ExportLog.created_at))
        .limit(limit)
    )
    return result.scalars().all()
