"""
places / place_districts / district_ingest icin veri erisim katmani.

Ingest yazar, sorgu katmani okur. has_contact turetimi burada tek
yerde tanimli: filtre paneli, contact_first siralamasi ve lead_score
hepsi bu tanima bagli.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import DistrictIngest, PlaceDistrict, PlaceRow

# Ulasilabilirlik sinyali sayilan etiketler.
#
# OSM'de iletisim iki bicimde yasiyor: duz (`phone`) ve `contact:`
# onekli (`contact:phone`). Ikisi de gecerli.
#
# `fax` bilincli olarak DISARIDA: tags_json icinde saklaniyor ama
# "bu kayda ulasabilirim" demek icin yeterli degil.
CONTACT_TAGS = frozenset({
    "phone", "mobile", "email", "website",
    "contact:phone", "contact:mobile", "contact:email", "contact:website",
})


def derive_has_contact(tags: dict) -> bool:
    """Kayitta kullanilabilir bir iletisim kanali var mi?"""
    return any(
        tags.get(tag) for tag in CONTACT_TAGS
    )


def extract_contact(tags: dict) -> tuple[str | None, str | None, str | None]:
    """
    (phone, email, website) uclusu.

    Duz etiket onekli etikete tercih ediliyor; `phone` yoksa `mobile`
    telefon yerine geciyor.
    """
    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("mobile")
        or tags.get("contact:mobile")
        or None
    )
    email = tags.get("email") or tags.get("contact:email") or None
    website = tags.get("website") or tags.get("contact:website") or None
    return phone, email, website


def place_row_values(
    element: dict,
    place_type: str | None,
    confidence: int,
    address: str | None,
) -> dict | None:
    """
    Overpass elemanini PlaceRow kolon sozlugune cevirir.

    Koordinat bulunamazsa None doner: node'da lat/lon, way ve
    relation'da `out center` ciktisindaki `center` alani var. Ikisi de
    yoksa kayit haritada gosterilemez ve mesafe hesaplanamaz.
    """
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center") or {}
        lat = center.get("lat")
        lon = center.get("lon")
    if lat is None or lon is None:
        return None

    tags = element.get("tags") or {}
    phone, email, website = extract_contact(tags)

    return {
        "id": f"osm:{element.get('type', 'node')}:{element['id']}",
        "lat": float(lat),
        "lon": float(lon),
        "name": tags.get("name") or tags.get("official_name") or None,
        "place_type": place_type,
        "subtype": None,
        "confidence": confidence,
        "has_contact": derive_has_contact(tags),
        "phone": phone,
        "email": email,
        "website": website,
        "address": address,
        "tags_json": json.dumps(tags, ensure_ascii=False),
        "fetched_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }


async def upsert_places(db: AsyncSession, rows: list[dict]) -> int:
    """
    Kayitlari ekle veya guncelle. Donus: islenen satir sayisi.

    ON CONFLICT gerekli: ayni kayit iki komsu ilcenin ingest'inde de
    donebiliyor (tampon bolgesi). Duz INSERT ikinci seferde
    IntegrityError firlatirdi.
    """
    if not rows:
        return 0

    statement = sqlite_insert(PlaceRow).values(rows)
    updatable = {
        column: getattr(statement.excluded, column)
        for column in (
            "lat", "lon", "name", "place_type", "subtype", "confidence",
            "has_contact", "phone", "email", "website", "address",
            "tags_json", "fetched_at",
        )
    }
    await db.execute(
        statement.on_conflict_do_update(index_elements=["id"], set_=updatable)
    )
    await db.commit()
    return len(rows)


async def replace_memberships(
    db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]
) -> int:
    """
    Bir ilcenin uyelik satirlarini bastan yaz.

    Yalnizca bu district_id'ye ait satirlar siliniyor: ayni kayit baska
    ilcelerin de uyesi olabiliyor (Kadikoy'un icinde VE Atasehir'in
    tamponunda) ve o satirlar korunmali.
    """
    await db.execute(
        delete(PlaceDistrict).where(PlaceDistrict.district_id == district_id)
    )

    if memberships:
        await db.execute(
            sqlite_insert(PlaceDistrict).values([
                {
                    "place_id": place_id,
                    "district_id": district_id,
                    "is_inside": is_inside,
                }
                for place_id, is_inside in memberships
            ])
        )

    await db.commit()
    return len(memberships)


async def mark_ingest(
    db: AsyncSession,
    district_id: str,
    place_count: int,
    query_count: int,
    status: str,
) -> None:
    """Ilcenin ingest durumunu yaz veya guncelle."""
    statement = sqlite_insert(DistrictIngest).values(
        district_id=district_id,
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
        place_count=place_count,
        query_count=query_count,
        status=status,
    )
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=["district_id"],
            set_={
                "fetched_at": statement.excluded.fetched_at,
                "place_count": statement.excluded.place_count,
                "query_count": statement.excluded.query_count,
                "status": statement.excluded.status,
            },
        )
    )
    await db.commit()


async def get_ingest_state(
    db: AsyncSession, district_id: str
) -> DistrictIngest | None:
    """Bir ilcenin ingest durumu; hic cekilmemisse None."""
    result = await db.execute(
        select(DistrictIngest).where(DistrictIngest.district_id == district_id)
    )
    return result.scalar_one_or_none()


async def ingest_states(db: AsyncSession) -> dict[str, DistrictIngest]:
    """Tum ilcelerin ingest durumu; arayuz tazelik uyarisi icin kullaniyor."""
    result = await db.execute(select(DistrictIngest))
    return {row.district_id: row for row in result.scalars().all()}
