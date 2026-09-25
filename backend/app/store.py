"""
places / place_districts / district_ingest icin veri erisim katmani.

Ingest yazar, sorgu katmani okur. has_contact turetimi burada tek
yerde tanimli: filtre paneli, contact_first siralamasi ve lead_score
hepsi bu tanima bagli.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import DistrictIngest, PlaceDistrict, PlaceRow

# SQLite tek sorguda en fazla 32766 parametre kabul ediyor. Toplu INSERT'ler
# bu yuzden parcalaniyor: places satiri 15 kolon, 500 satir = 7500 parametre.
# Parcalamadan once ~2200+ yerlik bir ilce (Atasehir Overture enrich'i)
# "too many SQL variables" ile dusuyordu.
ROWS_PER_INSERT = 500


def _batches(rows: list) -> list[list]:
    return [rows[i : i + ROWS_PER_INSERT] for i in range(0, len(rows), ROWS_PER_INSERT)]


def _upsert(db: AsyncSession, model):
    """
    ON CONFLICT destekleyen INSERT, baglantinin lehcesine gore.

    Yerelde SQLite, canlida Postgres (Supabase). Ikisi de ayni
    on_conflict_do_update/excluded arayuzunu sunuyor; yalnizca insert
    kurucusu lehceye ozel.
    """
    dialect = db.get_bind().dialect.name
    return (postgresql.insert if dialect == "postgresql" else sqlite.insert)(model)


def _last_wins(rows: list, key) -> list:
    """
    Ayni anahtar birden cok kez geliyorsa sonuncusu kalir.

    SQLite ayni toplu INSERT icindeki tekrarlari sirayla isliyordu (son
    deger kazaniyordu); Postgres ayni istekte bir satiri iki kez
    guncellemeyi reddediyor ("cannot affect row a second time").
    Tekrarlar bilincli olarak gelebiliyor (bkz. replace_memberships).
    """
    return list({key(row): row for row in rows}.values())

# Ulasilabilirlik sinyali sayilan etiketler.
#
# OSM'de iletisim iki bicimde yasiyor: duz (`phone`) ve `contact:`
# onekli (`contact:phone`). Ikisi de gecerli.
#
# `fax` bilincli olarak DISARIDA: tags_json icinde saklaniyor ama
# "bu kayda ulasabilirim" demek icin yeterli degil.
CONTACT_TAGS = frozenset(
    {
        "phone",
        "mobile",
        "email",
        "website",
        "contact:phone",
        "contact:mobile",
        "contact:email",
        "contact:website",
    }
)


def derive_has_contact(tags: dict) -> bool:
    """Kayitta kullanilabilir bir iletisim kanali var mi?"""
    return any(tags.get(tag) for tag in CONTACT_TAGS)


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
    # `url` de OSM'de gecerli bir web adresi etiketi; olculdugunde
    # yalnizca bu etikete sahip kayitlar vardi (ornegin ipkb.gov.tr) ve
    # website kolonlari bos kaliyordu.
    website = (
        tags.get("website")
        or tags.get("contact:website")
        or tags.get("url")
        or tags.get("contact:url")
        or None
    )
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

    for batch in _batches(_last_wins(rows, lambda r: r["id"])):
        statement = _upsert(db, PlaceRow).values(batch)
        excluded = statement.excluded
        updatable = {
            column: getattr(excluded, column)
            for column in (
                "lat",
                "lon",
                "name",
                "place_type",
                "subtype",
                "confidence",
                "tags_json",
                "fetched_at",
            )
        }
        # Iletisim alanlari: yeni deger bossa eskisi kalir. Overture enrich
        # OSM'de bos olan telefonu dolduruyor; sonraki tam OSM cekimi ayni
        # kaydi telefonsuz getirince bu koruma olmadan zenginlestirme
        # sessizce silinirdi.
        for column in ("phone", "email", "website", "address"):
            updatable[column] = func.coalesce(
                func.nullif(getattr(excluded, column), ""), getattr(PlaceRow, column)
            )
        updatable["has_contact"] = or_(excluded.has_contact, PlaceRow.has_contact)
        await db.execute(
            statement.on_conflict_do_update(index_elements=["id"], set_=updatable)
        )
    await db.commit()
    return len(rows)


async def delete_places(db: AsyncSession, ids: list[str]) -> None:
    """Kayitlari ve ilce uyeliklerini sil (commit cagirana ait)."""
    for batch in _batches(ids):
        await db.execute(delete(PlaceDistrict).where(PlaceDistrict.place_id.in_(batch)))
        await db.execute(delete(PlaceRow).where(PlaceRow.id.in_(batch)))


async def repoint_saved_places(db: AsyncSession, id_map: dict[str, str]) -> None:
    """
    Kayitli yerlerin place_id'sini eskiden yeniye tasi (commit cagirana ait).

    Arayuz "kaydedildi" isaretini place_id ile buluyor; birlestirmede
    silinen id'de kalan kayit haritada kaydedilmemis gorunurdu. Ayni
    anahtar yeni id'yi zaten kaydettiyse (UNIQUE api_key_id+place_id)
    eski kayit oldugu gibi birakilir: iki notu tek kayda sessizce
    birlestirmek devir teslimi bozardi.
    """
    for old_id, new_id in id_map.items():
        await db.execute(
            text(
                "UPDATE saved_places SET place_id = :new WHERE place_id = :old"
                " AND NOT EXISTS (SELECT 1 FROM saved_places s2"
                " WHERE s2.api_key_id = saved_places.api_key_id AND s2.place_id = :new)"
            ),
            {"old": old_id, "new": new_id},
        )


async def replace_memberships(
    db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]
) -> int:
    """
    Bir ilcenin uyelik satirlarini bastan yaz.

    Yalnizca bu district_id'ye ait OSM satirlari siliniyor: ayni kayit baska
    ilcelerin de uyesi olabiliyor (Kadikoy'un icinde VE Atasehir'in
    tamponunda) ve o satirlar korunmali.

    ON CONFLICT gerekli: bir way/relation, ingest bbox'i timeout sonrasi
    ceyreklere bolununce (split_bbox) birden fazla ceyrekten donebiliyor,
    yani `memberships` ayni place_id'yi tek cagride birden fazla kez
    tasiyabilir -- upsert_places'in coktan cozdugu sorunun aynisi. Duz
    INSERT bu toplu ekleme icinde bile UNIQUE(place_id, district_id)
    ihlaliyle patlardi; ON CONFLICT DO UPDATE ile SQLite ayni toplu
    INSERT icindeki tekrarlari da sirayla isler, son deger kazanir.
    """
    # Yalnizca OSM kaynakli kayitlarin uyeligi siliniyor. Overture
    # uyeligini enrich yaziyor; burada silinirse tam OSM cekimi Overture
    # kayitlarini ilce sorgusundan dusurur (yasandi: 228k uyelik 82k'ya
    # indi, kayitlar tabloda durdugu halde hicbir ilceye ait gorunmedi).
    osm_ids = select(PlaceRow.id).where(PlaceRow.source == "osm")
    await db.execute(
        delete(PlaceDistrict).where(
            PlaceDistrict.district_id == district_id,
            PlaceDistrict.place_id.in_(osm_ids),
        )
    )

    await _upsert_memberships(db, district_id, memberships)
    await db.commit()
    return len(memberships)


async def add_memberships(
    db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]
) -> int:
    """
    Uyelik satirlari EKLE; mevcutlari silme.

    replace_memberships'ten farki tam olarak bu. Overture ingest'i OSM
    kayitlarinin yanina ekleme yapiyor; replace_memberships cagrilsaydi
    ilcenin TUM OSM uyelikleri silinir ve o kayitlar ilce sorgusundan
    tamamen dusordu. Iki fonksiyon ayri duruyor cunku iki farkli niyet
    var: "bu kaynagin uyeliklerini bastan yaz" ve "bunlari da ekle".
    """
    await _upsert_memberships(db, district_id, memberships)
    return len(memberships)


async def _upsert_memberships(
    db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]
) -> None:
    """Uyelikleri parca parca yaz; ayni (place_id, district_id) guncellenir."""
    for batch in _batches(_last_wins(memberships, lambda m: m[0])):
        statement = _upsert(db, PlaceDistrict).values(
            [
                {"place_id": place_id, "district_id": district_id, "is_inside": is_inside}
                for place_id, is_inside in batch
            ]
        )
        await db.execute(
            statement.on_conflict_do_update(
                index_elements=["place_id", "district_id"],
                set_={"is_inside": statement.excluded.is_inside},
            )
        )


async def mark_ingest(
    db: AsyncSession,
    district_id: str,
    place_count: int,
    query_count: int,
    status: str,
) -> None:
    """Ilcenin ingest durumunu yaz veya guncelle."""
    statement = _upsert(db, DistrictIngest).values(
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


async def get_ingest_state(db: AsyncSession, district_id: str) -> DistrictIngest | None:
    """Bir ilcenin ingest durumu; hic cekilmemisse None."""
    result = await db.execute(
        select(DistrictIngest).where(DistrictIngest.district_id == district_id)
    )
    return result.scalar_one_or_none()


async def ingest_states(db: AsyncSession) -> dict[str, DistrictIngest]:
    """Tum ilcelerin ingest durumu; arayuz tazelik uyarisi icin kullaniyor."""
    result = await db.execute(select(DistrictIngest))
    return {row.district_id: row for row in result.scalars().all()}
