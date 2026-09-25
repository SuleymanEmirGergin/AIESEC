"""
Overture kayitlarini bir ilceye isle: mevcutlari zenginlestir, eksikleri ekle.

Iki is birden yapiliyor cunku iki dert de ayni veriden cozuluyor:
- OSM kayitlarimizin iletisim alanlari cogunlukla bos (telefon %9.2),
- Overture'da bizde hic olmayan kurumlar var.

Eslestirme: isim benzerligi + mesafe. Ayni isletme iki kaynakta farkli
id tasidigi icin id ile eslestirme mumkun degil.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.classify import tr_fold
from app.districts import expanded_bbox, point_membership
from app.overture import fetch_places
from app.store import (
    add_memberships,
    delete_places,
    repoint_saved_places,
    upsert_places,
)

logger = logging.getLogger(__name__)

DEFAULT_BUFFER_M = 2000

# Ayni isletme sayilmak icin en fazla bu kadar uzakta olabilirler.
# ~150 m: OSM bir okulu bahce merkezine, Overture giris kapisina
# koyabiliyor. Daha genis tutmak bitisik iki farkli okulu birlestirme
# riskini buyutuyordu.
MATCH_RADIUS_DEG = 0.0015


@dataclass
class OvertureResult:
    district_id: str
    fetched: int
    enriched: int
    inserted: int
    skipped_unmapped: int


# tr_fold buyuk/kucuk harfi Turkceye gore katliyor ama harfleri koruyor;
# kaynaklardan biri "Bakirkoy", digeri "Bakırköy" yazinca eslesmiyordu.
_ASCII = str.maketrans("ıöüşçğâîû", "iouscgaiu")


def _norm(name: str | None) -> str:
    """Isim karsilastirmasi icin normalize et (Turkce katlama + ASCII)."""
    return tr_fold(name or "").replace(" ", "").translate(_ASCII)


def _looks_same(a: str | None, b: str | None) -> bool:
    """
    Iki isim ayni isletmeyi mi gosteriyor?

    Tam esitlik yerine icerme: OSM "Sirinevler Ilkokulu", Overture
    "Sirinevler Ilkokulu Mudurlugu" yazabiliyor. Cok kisa isimlerde
    icerme yaniltici oldugu icin (ornegin "As") alt sinir var.
    """
    na, nb = _norm(a), _norm(b)
    if len(na) < 5 or len(nb) < 5:
        return na == nb and bool(na)
    return na == nb or na in nb or nb in na


_CONTACT_FIELDS = ("phone", "email", "website", "address")


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return int(lat // MATCH_RADIUS_DEG), int(lon // MATCH_RADIUS_DEG)


async def absorb_overture_duplicates(
    db: AsyncSession,
    rows: list[dict],
    bbox: tuple[float, float, float, float],
) -> tuple[list[dict], int]:
    """
    Yazilacak OSM satirlariyla ayni kurumu gosteren Overture kayitlarini
    OSM'e kat. Donus: (yeni satirlar, katilan Overture kaydi sayisi).

    Enrich OSM'den sonra calisinca eslestirmeyi kendisi yapiyor. Ama OSM
    bir ilceye Overture'dan SONRA gelirse (kismi cekimi tekrar denemek
    gibi) ayni kurum iki kez yaziliyordu. Kural enrich'inkiyle ayni: ad +
    150 m; OSM kaydi kalir, yalnizca BOS iletisim alanlari (ve tur)
    Overture'dan dolar, Overture kaydi silinir.

    Girdi satirlari degistirilmiyor; birlesen satir yeni bir dict.
    """
    south, west, north, east = bbox
    overture = (
        await db.execute(
            text(
                """
                SELECT id, name, lat, lon, place_type, phone, email, website, address
                FROM places
                WHERE source = 'overture'
                  AND lat BETWEEN :s AND :n AND lon BETWEEN :w AND :e
                """
            ),
            {"s": south, "n": north, "w": west, "e": east},
        )
    ).mappings().all()
    if not overture:
        return rows, 0

    # Izgara: her OSM satiri yalnizca komsu 9 hucreye bakiyor. Duz iki
    # dongu Eyupsultan gibi 7k+ OSM x binlerce Overture'da milyonlarca
    # karsilastirma demekti.
    grid: dict[tuple[int, int], list] = {}
    for o in overture:
        grid.setdefault(_cell(o["lat"], o["lon"]), []).append(o)

    absorbed: dict[str, str] = {}  # overture id -> osm id
    merged: list[dict] = []
    for row in rows:
        match = None
        if row.get("name"):
            ci, cj = _cell(row["lat"], row["lon"])
            candidates = (
                o
                for di in (-1, 0, 1)
                for dj in (-1, 0, 1)
                for o in grid.get((ci + di, cj + dj), ())
            )
            match = next(
                (
                    o
                    for o in candidates
                    if o["id"] not in absorbed
                    and abs(o["lat"] - row["lat"]) <= MATCH_RADIUS_DEG
                    and abs(o["lon"] - row["lon"]) <= MATCH_RADIUS_DEG
                    and _looks_same(row["name"], o["name"])
                ),
                None,
            )
        if match is None:
            merged.append(row)
            continue

        absorbed[match["id"]] = row["id"]
        patch = {k: match[k] for k in _CONTACT_FIELDS if not row.get(k) and match[k]}
        if not row.get("place_type") and match["place_type"]:
            patch["place_type"] = match["place_type"]
        new_row = {**row, **patch}
        new_row["has_contact"] = bool(
            new_row.get("has_contact")
            or new_row.get("phone")
            or new_row.get("email")
            or new_row.get("website")
        )
        merged.append(new_row)

    if absorbed:
        await repoint_saved_places(db, absorbed)
        await delete_places(db, list(absorbed))
        await db.commit()
        logger.info("OSM ingest: %s Overture kaydi OSM'e katildi", len(absorbed))
    return merged, len(absorbed)


async def ingest_overture_district(
    db: AsyncSession,
    district_id: str,
    buffer_m: int = DEFAULT_BUFFER_M,
) -> OvertureResult:
    """
    Ilceyi Overture ile zenginlestir ve eksik kurumlari ekle.

    Sira onemli: once zenginlestirme, sonra ekleme. Boylece bir Overture
    kaydi mevcut bir OSM kaydiyla eslesirse ikinci kez -- bu sefer yeni
    kayit olarak -- eklenmiyor.
    """
    bbox = expanded_bbox(district_id, buffer_m)
    candidates = fetch_places(bbox, only_mapped=False)

    # Bbox dikdortgen; Edirne'de Yunanistan'i, Kirklareli'nde
    # Bulgaristan'i iceriyor. Poligonla suzmezsek sinir otesi kayitlar
    # ilceye yazilirdi (olcumde +30 numarali Yunan okullari geldi).
    inside = [
        c
        for c in candidates
        if point_membership(district_id, c["lat"], c["lon"], buffer_m) is not None
    ]

    # Mevcut kayitlar KOORDINATLA seciliyor, place_districts join'iyle
    # degil. Uyelik turetilmis durum: basarisiz bir OSM cekimi ilcenin
    # uyeligini silince join bos donuyor ve ayni kurum Overture'dan
    # ikinci kez ekleniyordu (Fatih'te 326 cift). Bbox tampon dahil
    # ilceyi kapsiyor; eslesme zaten ad + 150 m ile daraliyor.
    south, west, north, east = bbox
    existing = (
        await db.execute(
            text(
                """
                SELECT p.id, p.name, p.lat, p.lon, p.phone, p.email,
                       p.website, p.address
                FROM places p
                WHERE p.lat BETWEEN :s AND :n AND p.lon BETWEEN :w AND :e
                """
            ),
            {"s": south, "n": north, "w": west, "e": east},
        )
    ).all()

    enriched = 0
    matched_overture: set[str] = set()

    for pid, name, lat, lon, phone, email, website, address in existing:
        for c in inside:
            if c["id"] in matched_overture:
                continue
            if abs(c["lat"] - lat) > MATCH_RADIUS_DEG:
                continue
            if abs(c["lon"] - lon) > MATCH_RADIUS_DEG:
                continue
            if not _looks_same(name, c["name"]):
                continue

            # Yalnizca BOS alanlar dolduruluyor. OSM degeri varsa
            # korunuyor: yerel katkiyi uzak kaynakla ezmek, gonullunun
            # elle duzelttigi bir numarayi sessizce geri almak demekti.
            patch = {
                k: c[k]
                for k, cur in (
                    ("phone", phone),
                    ("email", email),
                    ("website", website),
                    ("address", address),
                )
                if not cur and c[k]
            }
            matched_overture.add(c["id"])
            if patch:
                sets = ", ".join(f"{k} = :{k}" for k in patch)
                await db.execute(
                    text(
                        f"UPDATE places SET {sets},"
                        " has_contact = (COALESCE(phone,'') <> ''"
                        " OR COALESCE(email,'') <> ''"
                        " OR COALESCE(website,'') <> '')"
                        " WHERE id = :pid"
                    ),
                    {**patch, "pid": pid},
                )
                enriched += 1
            break

    # Eslesmeyenlerden taksonomiye uyanlar yeni kayit.
    new_rows = []
    skipped = 0
    for c in inside:
        if c["id"] in matched_overture:
            continue
        if not c["place_type"]:
            skipped += 1
            continue
        if not c["name"]:
            continue
        new_rows.append(
            {
                "id": c["id"],
                "lat": c["lat"],
                "lon": c["lon"],
                "name": c["name"],
                "place_type": c["place_type"],
                "subtype": c["category"],
                "confidence": c["confidence"],
                "has_contact": bool(c["phone"] or c["email"] or c["website"]),
                "phone": c["phone"],
                "email": c["email"],
                "website": c["website"],
                "address": c["address"],
                "tags_json": json.dumps(
                    {"overture_category": c["category"]}, ensure_ascii=False
                ),
                # Acikca veriliyor: upsert_places toplu values() kullaniyor
                # ve satirlarin anahtar kumesi ayni olmali.
                "fetched_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "source": "overture",
            }
        )

    if new_rows:
        await upsert_places(db, new_rows)
        # add_memberships, replace_memberships DEGIL: ikincisi ilcenin
        # tum uyelik satirlarini siliyor ve buradan cagrilsaydi o
        # ilcedeki butun OSM kayitlari sorgudan dusordu.
        memberships = [
            (r["id"], m)
            for r in new_rows
            if (m := point_membership(district_id, r["lat"], r["lon"], buffer_m))
            is not None
        ]
        await add_memberships(db, district_id, memberships)

    await db.commit()

    logger.info(
        "Overture %s: %s aday, %s ilce ici, %s zenginlestirildi, %s eklendi",
        district_id,
        len(candidates),
        len(inside),
        enriched,
        len(new_rows),
    )
    return OvertureResult(
        district_id=district_id,
        fetched=len(inside),
        enriched=enriched,
        inserted=len(new_rows),
        skipped_unmapped=skipped,
    )


async def _run_cli(district_ids: list[str]) -> int:
    from app.database import AsyncSessionLocal, init_db

    await init_db()
    failed = []
    for n, district_id in enumerate(district_ids, 1):
        try:
            async with AsyncSessionLocal() as db:
                r = await ingest_overture_district(db, district_id)
            print(f"[OVERTURE] {n}/{len(district_ids)} {district_id}: "
                  f"{r.fetched} kayit, {r.enriched} zenginlesti, {r.inserted} yeni")
        except Exception as error:  # tek ilce tum kosuyu durdurmasin
            logger.exception("Overture %s basarisiz", district_id)
            failed.append(f"{district_id} ({error.__class__.__name__})")
    if failed:
        print(f"[OVERTURE] Basarisiz: {', '.join(failed)}")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    """`python -m app.overture_ingest --all` (aylik GitHub Actions isi)."""
    import argparse
    import asyncio

    from app.ingest import PROVINCE_PLATES, _resolve_targets

    parser = argparse.ArgumentParser(
        prog="python -m app.overture_ingest",
        description="Ilceleri Overture Maps ile zenginlestir (OVERTURE_RELEASE ortam degiskeni)",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="Kapsamdaki tum ilceler")
    group.add_argument("--province", help=f"Tek il: {', '.join(PROVINCE_PLATES)}")
    group.add_argument("--district", help="Tek ilce kimligi, or. tr-34-kadikoy")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    return asyncio.run(_run_cli(_resolve_targets(args)))


if __name__ == "__main__":
    import sys

    sys.exit(main())
