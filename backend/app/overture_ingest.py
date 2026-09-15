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
from app.store import add_memberships, upsert_places

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


def _norm(name: str | None) -> str:
    """Isim karsilastirmasi icin normalize et (Turkce katlamayla)."""
    return tr_fold(name or "").replace(" ", "")


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
