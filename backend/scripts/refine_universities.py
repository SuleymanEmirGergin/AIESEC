"""
Tek seferlik: Overture'dan 'Universite' diye gelen kayitlari ada gore duzelt.

    python scripts/refine_universities.py <DATABASE_URL> [--apply]

--apply olmadan yalnizca ne degisecegini sayar. Kayitli yerlerin turu de
(ayni yer, hala 'Universite' ise) guncellenir ki listeler tutarli kalsin.
Yeni gelen veride ayni kural Overture eslemesinde (classify_overture) calisiyor.
"""

import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, update  # noqa: E402

from app.classify import refine_university  # noqa: E402
from app.database import PlaceRow, SavedPlace, make_engine  # noqa: E402

UNI = "college_university"


async def main(url: str, apply: bool) -> None:
    engine = make_engine(url)
    async with engine.begin() as conn:
        rows = (
            await conn.execute(
                select(PlaceRow.id, PlaceRow.name, PlaceRow.source).where(PlaceRow.place_type == UNI)
            )
        ).all()
        changes = {}
        for pid, name, source in rows:
            refined = refine_university(name)
            # Overture: universite degilse okul turu ya da siniflandirilamayan.
            # OSM (amenity=university/college daha guvenilir): yalniz ad acikca
            # okul diyorsa ("Aka Koleji") okul turune iner, hic dusurulmez.
            if source == "overture" and refined != UNI:
                changes[pid] = refined
            elif source != "overture" and refined not in (None, UNI):
                changes[pid] = refined
        print(f"Universite kaydi: {len(rows)}, degisecek: {len(changes)}")
        for place_type, n in Counter(changes.values()).most_common():
            print(f"  -> {place_type or 'siniflandirilamayan'}: {n}")
        if not apply:
            print("Deneme modu; uygulamak icin --apply")
            return
        saved = 0
        for place_type in set(changes.values()):
            ids = [pid for pid, t in changes.items() if t == place_type]
            for i in range(0, len(ids), 500):
                chunk = ids[i : i + 500]
                await conn.execute(update(PlaceRow).where(PlaceRow.id.in_(chunk)).values(place_type=place_type))
                result = await conn.execute(
                    update(SavedPlace)
                    .where(SavedPlace.place_id.in_(chunk), SavedPlace.place_type == UNI)
                    .values(place_type=place_type)
                )
                saved += result.rowcount or 0
        print(f"Uygulandi. Guncellenen kayitli yer: {saved}")
    await engine.dispose()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--apply"]
    if len(args) != 1:
        raise SystemExit(__doc__)
    asyncio.run(main(args[0], "--apply" in sys.argv))
