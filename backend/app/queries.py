"""
Yerel POI sorgulari: filtre -> SQL cevirisi ve siralama.

Bu dosyadaki hicbir kod Overpass'e gitmiyor. Filtre panelinin her
hareketi buraya dusuyor ve milisaniye mertebesinde donuyor.
"""

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import PlaceDistrict, PlaceRow

# 10 tur. count_by_type her zaman bu anahtarlarin hepsini donuyor:
# arayuz chip'leri bu sozlukten besleniyor ve eksik anahtar "sayi yok"
# ile "sifir" ayrimini bozar.
ALL_TYPES: tuple[str, ...] = (
    "factory", "office", "workshop",
    "kindergarten", "primary_school", "middle_school", "high_school",
    "private_school", "college_keyword", "college_university",
)

# SQL'de siralanabilenler.
SQL_SORTS = frozenset({"contact_first", "confidence", "name"})

# Python'da siralanmasi gerekenler.
#
# lead_score: kullanici tanimli formul, SQL'e cevrilemiyor.
# ref_distance: haversine trigonometri gerektiriyor ve SQLite'ta sin/cos
# derleme bayragina bagli (SQLITE_ENABLE_MATH_FUNCTIONS); guvenilemez.
#
# Bu iki siralamada filtrelenmis kume tamamen cekilip Python'da
# siralanip dilimleniyor. Ilce basina en fazla birkac bin satir
# oldugu icin maliyet ihmal edilebilir.
PYTHON_SORTS = frozenset({"lead_score", "ref_distance"})

VALID_SORTS = SQL_SORTS | PYTHON_SORTS


@dataclass(frozen=True)
class PlaceFilter:
    """Sorgu endpoint'inin butun parametreleri."""

    district_id: str
    types: tuple[str, ...] = ()
    has_contact: bool = False
    named_only: bool = False
    min_confidence: int = 0
    q: str | None = None
    include_buffer: bool = True
    include_unclassified: bool = False
    sort: str = "contact_first"
    ref_lat: float | None = None
    ref_lon: float | None = None
    limit: int = 500
    offset: int = 0


def build_places_query(f: PlaceFilter) -> Select:
    """
    Filtreden SQLAlchemy Select uretir. LIMIT/OFFSET uygulanmiyor —
    onu fetch_places siralama yoluna gore ekliyor.

    Tum degerler baglanmis parametre olarak gidiyor; sorgu metnine
    string birlestirme yapilmiyor.
    """
    statement = (
        select(PlaceRow)
        .join(PlaceDistrict, PlaceDistrict.place_id == PlaceRow.id)
        .where(PlaceDistrict.district_id == f.district_id)
    )

    if not f.include_buffer:
        statement = statement.where(PlaceDistrict.is_inside.is_(True))

    if f.types:
        statement = statement.where(PlaceRow.place_type.in_(f.types))
    elif not f.include_unclassified:
        # Tur belirtilmediginde siniflandirilamayan kayitlar gizli.
        statement = statement.where(PlaceRow.place_type.is_not(None))

    if f.has_contact:
        statement = statement.where(PlaceRow.has_contact.is_(True))

    if f.named_only:
        statement = statement.where(PlaceRow.name.is_not(None))

    if f.min_confidence > 0:
        statement = statement.where(PlaceRow.confidence >= f.min_confidence)

    if f.q:
        # SQLite LIKE varsayilan olarak ASCII'de buyuk-kucuk duyarsiz.
        # Turkce karakterlerde duyarsizlik garantili degil; arayuz
        # bunu kullaniciya sezdirmeden calisiyor cunku cogu arama
        # ASCII harfle baslıyor.
        statement = statement.where(PlaceRow.name.ilike(f"%{f.q}%"))

    return statement


def _apply_sql_sort(statement: Select, sort: str) -> Select:
    """SQL'de siralanabilen secenekleri uygular."""
    if sort == "contact_first":
        # Ulasabildigim kayitlar ustte, icinde alfabetik.
        return statement.order_by(
            PlaceRow.has_contact.desc(), PlaceRow.name.is_(None), PlaceRow.name
        )
    if sort == "confidence":
        return statement.order_by(
            PlaceRow.confidence.desc(), PlaceRow.name.is_(None), PlaceRow.name
        )
    # name: isimsizler en sona (NULL'lar SQLite'ta once gelirdi)
    return statement.order_by(PlaceRow.name.is_(None), PlaceRow.name)


def lead_score(place: PlaceRow) -> int:
    """
    Outreach icin "bu kaydi ne kadar onemsemeliyim" skoru (0-100).
    Panelde 'Lead kalitesi' siralamasini besliyor.

    Agirliklar karara baglandi: ulasilabilirlik (telefon/e-posta/website,
    toplam 60) kimlik netliginden (isim/guven skoru, toplam 40) daha agir
    basiyor. Telefonu olan isimsiz bir fabrika, telefonu olmayan isimli
    bir okuldan daha yuksek skor alir.

    Dagilim:
      telefon      35  — dogrudan aranabilir, en degerli sinyal
      e-posta      15  — asenkron ama kisisel
      website      10  — iletisim bulmak icin bir adim daha gerekiyor
      isim         20  — isimsiz kayda outreach yapilamiyor
      guven skoru  20  — yanlis kategoriye yapilan outreach israf
    """
    score = 0

    if place.phone:
        score += 35
    if place.email:
        score += 15
    if place.website:
        score += 10
    if place.name:
        score += 20

    # confidence 0-100 arasi; agirligi 20 puana olcekle.
    score += round((place.confidence or 0) * 0.20)

    return min(100, score)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Iki nokta arasi mesafe (metre). app.geo ile ayni formul."""
    rlat1, rlon1, rlat2, rlon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    return 2 * asin(sqrt(a)) * 6371000


def sort_in_python(rows: list[PlaceRow], f: PlaceFilter) -> list[PlaceRow]:
    """SQL'de yapilamayan siralamalari uygular."""
    if f.sort == "lead_score":
        return sorted(rows, key=lambda r: (-lead_score(r), r.name or "￿"))

    # ref_distance: referans nokta verilmediyse siralama anlamsiz,
    # kayitlar oldugu gibi doner (sessizce yanlis sira uretmekten iyi).
    if f.ref_lat is None or f.ref_lon is None:
        return rows

    return sorted(
        rows,
        key=lambda r: _haversine_m(f.ref_lat, f.ref_lon, r.lat, r.lon),
    )


async def fetch_places(
    db: AsyncSession, f: PlaceFilter
) -> tuple[list[PlaceRow], int]:
    """
    Filtrelenmis ve siralanmis sayfa + filtrelenmis kumenin toplam
    boyutu.

    total her zaman sayfa boyutundan bagimsiz: arayuz "412 sonuctan
    1-50" gosterebilsin.
    """
    if f.sort not in VALID_SORTS:
        raise ValueError(
            f"Gecersiz siralama: {f.sort}. Gecerli: {', '.join(sorted(VALID_SORTS))}"
        )

    statement = build_places_query(f)

    count_statement = select(func.count()).select_from(statement.subquery())
    total = (await db.execute(count_statement)).scalar_one()

    if f.sort in SQL_SORTS:
        page = statement.limit(f.limit).offset(f.offset)
        rows = list((await db.execute(_apply_sql_sort(page, f.sort))).scalars().all())
        return rows, total

    # Python siralamasi: filtrelenmis kumeyi tamamen cek, sirala, dilimle.
    all_rows = list((await db.execute(statement)).scalars().all())
    ordered = sort_in_python(all_rows, f)
    return ordered[f.offset : f.offset + f.limit], total


async def count_by_type(
    db: AsyncSession, district_id: str, include_buffer: bool = True
) -> dict[str, int]:
    """
    Tur basina kayit sayisi. 10 turun hepsi anahtar olarak donuyor,
    sifir olanlar dahil.

    Siniflandirilamayan (place_type IS NULL) kayitlar sayilmiyor:
    arayuzde onlara ait bir chip yok.
    """
    statement = (
        select(PlaceRow.place_type, func.count())
        .join(PlaceDistrict, PlaceDistrict.place_id == PlaceRow.id)
        .where(
            PlaceDistrict.district_id == district_id,
            PlaceRow.place_type.is_not(None),
        )
        .group_by(PlaceRow.place_type)
    )
    if not include_buffer:
        statement = statement.where(PlaceDistrict.is_inside.is_(True))

    result = await db.execute(statement)
    found = dict(result.all())

    return {place_type: found.get(place_type, 0) for place_type in ALL_TYPES}
