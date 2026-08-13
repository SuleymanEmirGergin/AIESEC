"""
Ilce secimli yerel POI arama.

Bu router'daki hicbir yol Overpass'e gitmiyor: veri `ingest.py` ile bir
kez cekiliyor, buradaki sorgular yerel SQLite uzerinde calisiyor. Ag
olmadan da cevap veriyor.

Kimlik: sinir verisi (metadata + geojson) acik, cunku harita cizimi icin
gerekli statik bir varlik ve kisisel veri icermiyor. POI donen iki uc
`validate_api_key` kullaniyor - anahtari dogruluyor ama kota
harcamiyor: bu sorgularin dis maliyeti sifir, kota saymak yanlis olurdu.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_api_key
from app.database import APIKey, get_db
from app.districts import all_districts, get_district, raw_geojson
from app.models import (
    DistrictMeta,
    DistrictPlace,
    DistrictPlacesResponse,
    DistrictSummaryResponse,
)
from app.queries import (
    VALID_SORTS,
    PlaceFilter,
    count_by_type,
    fetch_places,
    lead_score,
)
from app.store import get_ingest_state, ingest_states

router = APIRouter(prefix="/api/districts", tags=["districts"])

# Sinir verisi elle uretiliyor ve nadiren degisiyor; tarayici uzun sure
# tutabilir. GeoJSON'a `immutable` de veriliyor cunku icerigi degisirse
# dosya zaten yeniden uretilip deploy ediliyor.
METADATA_CACHE = "public, max-age=86400"
GEOJSON_CACHE = "public, max-age=604800, immutable"


def _parse_types(raw: str | None) -> tuple[str, ...]:
    """`types=factory,office` -> ("factory", "office")"""
    if not raw:
        return ()
    return tuple(t.strip() for t in raw.split(",") if t.strip())


@router.get("", response_model=list[DistrictMeta])
async def list_districts(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Ilce listesi (poligonsuz, ~8 KB).

    Ingest durumu da doner: arayuz hangi ilcenin cekilmedigini ve
    hangisinin verisinin eskidigini buradan biliyor.
    """
    response.headers["Cache-Control"] = METADATA_CACHE

    states = await ingest_states(db)

    return [
        DistrictMeta(
            id=d.id,
            name=d.name,
            province=d.province,
            province_plate=d.province_plate,
            bbox=list(d.bbox),
            center=list(d.center),
            fetched_at=(s.fetched_at if (s := states.get(d.id)) else None),
            place_count=(s.place_count if s else None),
            status=(s.status if s else None),
        )
        for d in all_districts()
    ]


@router.get("/geojson")
async def districts_geojson(response: Response):
    """
    Ilce poligonlari (~500 KB - 1 MB).

    Dosya oldugu gibi servis ediliyor; frontend'e kopyalanmiyor ki tek
    kaynak kalsin.
    """
    response.headers["Cache-Control"] = GEOJSON_CACHE
    try:
        return raw_geojson()
    except FileNotFoundError as exc:
        # Sinir verisi uretilmemis: bu bir yapilandirma eksigi, sunucu
        # hatasi degil. Mesaj ne yapilmasi gerektigini soyluyor.
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{district_id}/places", response_model=DistrictPlacesResponse)
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
):
    """Filtrelenmis, siralanmis ve sayfalanmis POI listesi."""
    if get_district(district_id) is None:
        raise HTTPException(status_code=404, detail=f"Bilinmeyen ilce: {district_id}")

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

    places = []
    for row in rows:
        place = DistrictPlace.model_validate(row)
        # Skor yalnizca o siralama istendiginde hesaplaniyor; diger
        # yollarda her satir icin bosuna is olurdu.
        if sort == "lead_score":
            place.lead_score = lead_score(row)
        places.append(place)

    return DistrictPlacesResponse(
        district_id=district_id,
        data=places,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{district_id}/summary", response_model=DistrictSummaryResponse)
async def district_summary(
    district_id: str,
    include_buffer: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _: APIKey = Depends(validate_api_key),
):
    """
    Tur basina sayim + ingest durumu.

    Tur chip'lerindeki sayilari besliyor; 10 turun hepsi anahtar olarak
    doner (sifir olanlar dahil) ki "sayi yok" ile "sifir" karismasin.
    """
    district = get_district(district_id)
    if district is None:
        raise HTTPException(status_code=404, detail=f"Bilinmeyen ilce: {district_id}")

    counts = await count_by_type(db, district_id, include_buffer=include_buffer)
    state = await get_ingest_state(db, district_id)

    return DistrictSummaryResponse(
        district_id=district_id,
        name=district.name,
        counts=counts,
        total=sum(counts.values()),
        fetched_at=state.fetched_at if state else None,
        place_count=state.place_count if state else None,
        status=state.status if state else None,
    )
