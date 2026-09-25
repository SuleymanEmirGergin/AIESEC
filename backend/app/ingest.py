"""
Ilce bazli POI ingest. Uygulamanin tum ag maliyeti bu dosyada.

Neden aile bazli, tur bazli degil:
  10 turun Overpass secicilerinin birlesimi 18 tane. Turu Overpass'e
  sormak gereksiz is — tur ayrimi classify.py tarafindan yerel olarak
  uretiliyor. Bir ilcenin ham verisini bir kez cekince 10 turun hepsi
  o veriden cikiyor. Anahtar uzayi ilce x tur = 720 degil, ilce = 80.

Neden 18 selector tek sorguda degil:
  Puturge (~1100 km2), Silivri, Sile gibi buyuk ilcelerde 18 secicilik
  tek sorgu timeout riski tasiyor. Iki aileye bolununce her sorgu 9
  secici tasiyor.

Ilce basina 4 sorgu (2 aile x 2 asama), 80 ilce = 320 sorgu, tek
seferlik.

Kullanim:
    python -m app.ingest --all
    python -m app.ingest --province istanbul
    python -m app.ingest --district tr-34-kadikoy
    python -m app.ingest --all --force
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.classify import (
    classify_b2b_type,
    classify_school_level,
    classify_service_type,
    tr_fold,
)
from app.database import AsyncSessionLocal, init_db
from app.districts import (
    DEFAULT_BUFFER_M,
    all_districts,
    districts_for_province,
    expanded_bbox,
    get_district,
    point_membership,
)
from app.overpass import OverpassError, overpass_client
from app.overture_ingest import absorb_overture_duplicates
from app.search_service import is_valid_unnamed
from app.store import (
    get_ingest_state,
    mark_ingest,
    place_row_values,
    replace_memberships,
    upsert_places,
)

logger = logging.getLogger(__name__)

# 21 turun secicilerinin birlesimi, iki aileye bolunmus.
# Toplam 24; bu sayi degisirse ingest sorgu maliyeti de degisir.
SELECTOR_FAMILIES: dict[str, tuple[str, ...]] = {
    "b2b": (
        '["man_made"="works"]',
        '["industrial"]',
        '["building"="industrial"]',
        '["building"="warehouse"]',
        '["building"="commercial"]',
        '["building"="office"]',
        '["landuse"="industrial"]',
        '["office"]',
        '["craft"]',
        # Otel, dil kursu, seyahat acentesi de bu ailede: ucuncu bir aile
        # Overpass sorgu sayisini %50 artirirdi. Sirket ve emlak ofisi
        # zaten `["office"]` secicisinden geliyor.
        '["tourism"~"^(hotel|hostel|motel|guest_house|resort|zoo|aquarium|theme_park|museum)$"]',
        '["amenity"="language_school"]',
        '["shop"="travel_agency"]',
        # Gezi & eglence
        '["leisure"~"^(water_park|nature_reserve)$"]',
        '["leisure"="garden"]["garden:type"="botanical"]',
        '["boundary"="national_park"]',
    ),
    "education": (
        '["amenity"="kindergarten"]',
        '["amenity"="school"]',
        '["amenity"="university"]',
        '["amenity"="college"]',
        '["building"="kindergarten"]',
        '["building"="school"]',
        '["building"="university"]',
        '["education"="school"]',
        '["education"="university"]',
    ),
}

# Bu sureden eski ingest "bayat" sayilir. Otomatik tazeleme YOK;
# arayuz yalnizca hatirlatma gosteriyor, karar kullanicida.
FRESH_AFTER_DAYS = 30

# Overpass IP basina 2 es zamanli slot veriyor.
DEFAULT_CONCURRENCY = 2

PROVINCE_PLATES = {
    "istanbul": "34",
    "edirne": "22",
    "tekirdag": "59",
    "kirklareli": "39",
    "malatya": "44",
}


@dataclass(frozen=True)
class IngestResult:
    """Bir ilcenin ingest sonucu."""

    district_id: str
    place_count: int
    query_count: int
    status: str  # ok | partial | failed
    skipped: bool = False


def build_family_query(
    selectors: tuple[str, ...],
    bbox: tuple[float, float, float, float],
    stage: int,
) -> str:
    """
    Bir aile icin Overpass QL sorgusu.

    stage 1 isimli kayitlari, stage 2 isimsizleri getiriyor. Ikisini
    ayirmak veri tekrarini onluyor: [!"name"] olmadan stage 2 ayni
    kayitlari tekrar donerdi.

    `out tags center` sart: way ve relation'larin koordinati `center`
    alanindan geliyor, onsuz place_row_values None doner.
    """
    south, west, north, east = bbox
    loc = f"({south:.6f},{west:.6f},{north:.6f},{east:.6f})"
    name_filter = '["name"]' if stage == 1 else '[!"name"]'

    timeout_cfg = int(os.getenv("OVERPASS_TIMEOUT", "60"))
    lines = "\n".join(f"  nwr{s}{name_filter}{loc};" for s in selectors)

    return f"""[out:json][timeout:{timeout_cfg}];
(
{lines}
);
out tags center;"""


def split_bbox(
    bbox: tuple[float, float, float, float],
) -> list[tuple[float, float, float, float]]:
    """
    bbox'i dort ceyrege boler. Timeout alan buyuk ilceler icin.
    Ceyrekler ortada bulusuyor; sinirdaki kayitlar iki ceyrekte de
    donebilir ama upsert tekrari zararsiz yapiyor.
    """
    south, west, north, east = bbox
    mid_lat = (south + north) / 2
    mid_lon = (west + east) / 2
    return [
        (south, west, mid_lat, mid_lon),
        (south, mid_lon, mid_lat, east),
        (mid_lat, west, north, mid_lon),
        (mid_lat, mid_lon, north, east),
    ]


# Ayni kurumun node ve way cizimi icin eslesme yaricapi (~150 m);
# overture_ingest.MATCH_RADIUS_DEG ile ayni gerekce.
NODE_WAY_RADIUS_DEG = 0.0015


def _contact_score(row: dict) -> int:
    return sum(1 for k in ("phone", "email", "website", "address") if row.get(k))


def dedupe_node_way(rows: list[dict]) -> list[dict]:
    """
    OSM ayni kurumu hem nokta (node) hem alan (way/relation) olarak
    cizebiliyor; ikisi de ayni adla, ayni yerde gelir ve gonullu icin
    "ayni muzeyi iki kez aramak" demektir (olculdu: 118 cift). Ayni ad
    + ayni tur + 150 m icindeki node/alan ciftinden iletisimi fazla
    olan kalir; esitlikte alan (way/relation).
    """
    by_key: dict[tuple[str, str | None], list[dict]] = {}
    for row in rows:
        name = tr_fold(row.get("name") or "").replace(" ", "")
        if not name:
            continue
        by_key.setdefault((name, row.get("place_type")), []).append(row)

    dropped: set[str] = set()
    for group in by_key.values():
        nodes = [r for r in group if r["id"].startswith("osm:node:")]
        areas = [r for r in group if not r["id"].startswith("osm:node:")]
        for node in nodes:
            for area in areas:
                if area["id"] in dropped:
                    continue
                if (
                    abs(node["lat"] - area["lat"]) < NODE_WAY_RADIUS_DEG
                    and abs(node["lon"] - area["lon"]) < NODE_WAY_RADIUS_DEG
                ):
                    loser = node if _contact_score(node) <= _contact_score(area) else area
                    dropped.add(loser["id"])
                    break
    return [r for r in rows if r["id"] not in dropped]


def classify_element(tags: dict, element_type: str) -> str | None:
    """
    Elemani 10 turden birine ata; siniflandirilamazsa None.

    Once egitim denenir: `classify_school_level` yalnizca amenity
    school/kindergarten/university/college icin sonuc donuyor, yani
    yanlis pozitif riski yok. Ardindan B2B.

    None donen kayitlar atilmiyor, place_type=NULL ile saklaniyor
    (or. `building=school` tasiyip `amenity=school` tasimayanlar).
    """
    name = tags.get("name") or ""
    school = classify_school_level(tags, name)
    if school:
        return school

    service = classify_service_type(tags, name)
    if service:
        return service

    return classify_b2b_type(tags, element_type)


async def _fetch_family_stage(
    selectors: tuple[str, ...],
    bbox: tuple[float, float, float, float],
    stage: int,
) -> tuple[list[dict], int, bool]:
    """
    Bir aile+asama icin Overpass'ten eleman cek.

    Donus (elements, query_count, ok). Timeout/hata durumunda bbox
    dorde bolunup yeniden denenir; ceyreklerin bir kismi basarisiz
    olursa ok=False doner ve ilce 'partial' isaretlenir.
    """
    try:
        data = await overpass_client.query(build_family_query(selectors, bbox, stage))
        return data.get("elements", []), 1, True
    except OverpassError as exc:
        logger.warning("Aile sorgusu basarisiz, bbox bolunuyor: %s", exc)

    elements: list[dict] = []
    query_count = 1  # basarisiz olan ilk deneme de sayiliyor
    all_ok = True

    for part in split_bbox(bbox):
        try:
            data = await overpass_client.query(
                build_family_query(selectors, part, stage)
            )
            elements.extend(data.get("elements", []))
            query_count += 1
        except OverpassError as exc:
            logger.error("Ceyrek sorgusu da basarisiz: %s", exc)
            query_count += 1
            all_ok = False

    return elements, query_count, all_ok


def _address_from_tags(tags: dict) -> str | None:
    """
    OSM adres etiketlerinden okunabilir adres uretir.

    `addr:quarter` ve `addr:postcode` de okunuyor: olculdugunde 323
    kaydin addr:* etiketi vardi ama adresi bos cikiyordu, cunku bunlarin
    bir kisminda yalnizca mahalle veya posta kodu bulunuyor. Turkiye
    verisinde mahalle sik sik `quarter` olarak giriliyor.
    """
    parts = [
        tags.get("addr:street"),
        tags.get("addr:housenumber"),
        tags.get("addr:neighbourhood")
        or tags.get("addr:suburb")
        or tags.get("addr:quarter"),
        tags.get("addr:district"),
        tags.get("addr:city") or tags.get("addr:province"),
        tags.get("addr:postcode"),
    ]
    joined = " ".join(p for p in parts if p)
    return joined or None


async def ingest_district(
    db: AsyncSession,
    district_id: str,
    buffer_m: int = DEFAULT_BUFFER_M,
    force: bool = False,
) -> IngestResult:
    """
    Bir ilceyi cek, siniflandir, tabloya yaz.

    force=False ve kayit FRESH_AFTER_DAYS'den taze ise hic sorgu
    atmadan doner (idempotency): yarida kesilen --all calistirmasi
    kaldigi yerden devam edebiliyor.
    """
    district = get_district(district_id)
    if district is None:
        raise KeyError(f"Kapsam disi veya bilinmeyen ilce: {district_id}")

    if not force:
        state = await get_ingest_state(db, district_id)
        if state is not None and state.status == "ok":
            age = datetime.now(timezone.utc).replace(tzinfo=None) - state.fetched_at
            if age < timedelta(days=FRESH_AFTER_DAYS):
                return IngestResult(
                    district_id=district_id,
                    place_count=state.place_count,
                    query_count=0,
                    status=state.status,
                    skipped=True,
                )

    bbox = expanded_bbox(district_id, buffer_m)
    total_queries = 0
    all_ok = True
    rows_by_id: dict[str, dict] = {}

    for family, selectors in SELECTOR_FAMILIES.items():
        # Canli aramada MIN_STAGE1_B2B/MIN_STAGE1_SCHOOL esikleri stage 2'yi
        # atlayabiliyor (search_service.py) — istek basina ekstra sorgudan
        # kacinmak icin. Ingest tek seferlik oldugundan o kisayol burada
        # gecerli degil: tamlik, sorgu tasarrufundan daha degerli. Stage 2
        # bu yuzden esik gozetmeksizin HER zaman calisiyor.
        for stage in (1, 2):
            elements, queries, ok = await _fetch_family_stage(selectors, bbox, stage)
            total_queries += queries
            all_ok = all_ok and ok

            for element in elements:
                tags = element.get("tags") or {}
                place_type = classify_element(tags, element.get("type", "node"))

                # Stage 2 isimsiz kayitlari getiriyor; buyuk kismi
                # gurultu. Mevcut son-filtre korunuyor.
                #
                # Siniflandirma bu filtreden ONCE yapiliyor:
                # is_valid_unnamed ikinci argumani TUR olarak
                # yorumluyor ("workshop" ise craft, "office" ise office
                # etiketine bakiyor). Aile adi ("b2b") gecilirse o iki
                # dal hic calismaz ve gecerli atolye/ofis kayitlari
                # sessizce dusurulur.
                if stage == 2 and not is_valid_unnamed(element, place_type or ""):
                    continue

                values = place_row_values(
                    element,
                    place_type,
                    confidence=70 if stage == 1 else 40,
                    address=_address_from_tags(tags),
                )
                if values is not None:
                    rows_by_id[values["id"]] = values

    # Yalnizca ilce + tampon icindekiler yaziliyor. Sorgu bbox'i dikdortgen;
    # koselerinden gelen kayitlar hicbir ilceye baglanmadan tabloda
    # kaliyordu (tam cekimde 958). Komsu ilcenin kaydi o ilcenin kendi
    # cekiminde gelir, yani burada atmak veri kaybi degil.
    #
    # districts_for_point yerine point_membership: 80 ilcenin hepsini
    # test edip 79'unu atmak gereksiz maliyet olurdu.
    rows: list[dict] = []
    memberships: list[tuple[str, bool]] = []
    for row in dedupe_node_way(list(rows_by_id.values())):
        membership = point_membership(district_id, row["lat"], row["lon"], buffer_m)
        if membership is None:
            continue
        rows.append(row)
        memberships.append((row["id"], membership))

    # Bos ama "basarili" yanit, onceden kaydi olan bir ilce icin veri
    # degil ayna sorunudur: yalnizca Isvicre verisi tasiyan bir ayna
    # Turkiye bbox'ina 2 saniyede bos yanit verdi ve asagidaki
    # replace_memberships 48 ilcenin uyeligini sildi. Uyelige dokunma,
    # failed isaretle; --all bir sonraki turda yeniden ceker.
    previous = await get_ingest_state(db, district_id)
    if not rows and previous is not None and (previous.place_count or 0) > 0:
        logger.error(
            "%s: onceki cekimde %s kayit vardi, simdi 0 geldi; ayna suphesi, uyelik korunuyor",
            district_id,
            previous.place_count,
        )
        await mark_ingest(db, district_id, previous.place_count, total_queries, "failed")
        return IngestResult(
            district_id=district_id,
            place_count=previous.place_count,
            query_count=total_queries,
            status="failed",
        )

    # Overture bu ilceye OSM'den once islendiyse ayni kurumlar orada da
    # var; yazmadan once OSM kaydina katiliyor, yoksa cift kalirdi.
    rows, _ = await absorb_overture_duplicates(db, rows, bbox)

    await upsert_places(db, rows)

    # Uyelik: yalnizca ISLENEN ilceye karsi test ediliyor. Kaydin
    # baska ilcelere uyeligi o ilcelerin ingest'inde kurulur, cunku
    # replace_memberships yalnizca bu district_id'nin satirlarini
    # siliyor. Birlestirme id'leri degistirmedigi icin yukarida
    # hesaplanan uyelikler gecerli.
    await replace_memberships(db, district_id, memberships)

    status = "ok" if all_ok else ("partial" if rows else "failed")
    await mark_ingest(db, district_id, len(rows), total_queries, status)

    return IngestResult(
        district_id=district_id,
        place_count=len(rows),
        query_count=total_queries,
        status=status,
    )


async def ingest_many(
    district_ids: list[str],
    concurrency: int = DEFAULT_CONCURRENCY,
    buffer_m: int = DEFAULT_BUFFER_M,
    force: bool = False,
) -> list[IngestResult]:
    """
    Birden fazla ilceyi sinirli es zamanlilikla cek.

    Her ilce kendi DB oturumunu aciyor: paylasilan AsyncSession
    es zamanli kullanimda guvenli degil.
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: list[IngestResult] = []
    total = len(district_ids)
    done = {"n": 0}

    async def _one(district_id: str) -> None:
        async with semaphore:
            started = time.monotonic()
            async with AsyncSessionLocal() as session:
                try:
                    result = await ingest_district(
                        session, district_id, buffer_m, force
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.error("[INGEST] %s basarisiz: %s", district_id, exc)
                    result = IngestResult(district_id, 0, 0, "failed")

            done["n"] += 1
            elapsed = time.monotonic() - started
            note = (
                "atlandi"
                if result.skipped
                else (
                    f"{result.query_count} sorgu {elapsed:.1f}s "
                    f"{result.place_count} kayit [{result.status}]"
                )
            )
            print(f"[INGEST] {done['n']}/{total} {district_id} {note}")
            results.append(result)

    await asyncio.gather(*(_one(d) for d in district_ids))
    return results


def _resolve_targets(args: argparse.Namespace) -> list[str]:
    """CLI argumanlarindan ilce kimlik listesi uretir."""
    if args.district:
        if get_district(args.district) is None:
            raise SystemExit(
                f"Kapsam disi veya bilinmeyen ilce: {args.district}\n"
                f"Kapsam: {', '.join(PROVINCE_PLATES)}"
            )
        return [args.district]

    if args.province:
        plate = PROVINCE_PLATES.get(args.province.lower())
        if plate is None:
            raise SystemExit(
                f"Kapsam disi il: {args.province}\nKapsam: {', '.join(PROVINCE_PLATES)}"
            )
        return [d.id for d in districts_for_province(plate)]

    return [d.id for d in all_districts()]


async def _run(args: argparse.Namespace) -> int:
    await init_db()
    targets = _resolve_targets(args)

    print(f"[INGEST] {len(targets)} ilce, es zamanlilik {args.concurrency}")
    started = time.monotonic()
    results = await ingest_many(targets, args.concurrency, args.buffer, args.force)
    elapsed = time.monotonic() - started

    queries = sum(r.query_count for r in results)
    places = sum(r.place_count for r in results if not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    failed = [r.district_id for r in results if r.status == "failed"]
    partial = [r.district_id for r in results if r.status == "partial"]

    print(
        f"\n[INGEST] Bitti: {len(results)} ilce, {skipped} atlandi, "
        f"{queries} sorgu, {places} kayit, {elapsed / 60:.1f} dk"
    )
    if partial:
        print(f"[INGEST] Kismi: {', '.join(partial)}")
    if failed:
        print(f"[INGEST] Basarisiz: {', '.join(failed)}")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest",
        description="Ilce bazli POI ingest (Overpass -> yerel SQLite)",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="Kapsamdaki 80 ilce")
    group.add_argument("--province", help=f"Tek il: {', '.join(PROVINCE_PLATES)}")
    group.add_argument("--district", help="Tek ilce kimligi, or. tr-34-kadikoy")
    parser.add_argument(
        "--force", action="store_true", help="Taze kayitlari da yeniden cek"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help=f"Es zamanli ilce sayisi (varsayilan {DEFAULT_CONCURRENCY}; "
        f"Overpass IP basina 2 slot veriyor)",
    )
    parser.add_argument(
        "--buffer",
        type=int,
        default=DEFAULT_BUFFER_M,
        help=f"Ilce sinirina eklenen tampon, metre (varsayilan {DEFAULT_BUFFER_M})",
    )

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
