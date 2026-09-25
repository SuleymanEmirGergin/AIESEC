"""
SQLite -> Postgres tek seferlik veri tasima.

    python scripts/migrate_sqlite_to_pg.py sqlite+aiosqlite:///./storage.db \
        postgresql+asyncpg://user:pass@host:5432/postgres

Tablolari ORM metadata sirasiyla (yabanci anahtar bagimliligina gore)
kopyalar; tipler SQLAlchemy uzerinden gectigi icin SQLite'in 0/1
boolean'lari ve metin tarihleri Postgres'e dogru tipte yazilir. Elle
id verilen tablolarin serileri sonda ilerletilir, yoksa ilk yeni kayit
mevcut id=1 ile cakisirdi.

Hedef bos olmali: yarim kalmis bir tasimanin ustune yazmak sessizce
cift kayit ya da cakisma demek.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Integer, func, select, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.database import Base, _engine_options  # noqa: E402

ROWS_PER_BATCH = 2000


async def migrate(source_url: str, target_url: str) -> None:
    source = create_async_engine(source_url)
    target = create_async_engine(target_url, **_engine_options(target_url))
    tables = Base.metadata.sorted_tables

    async with target.begin() as dst:
        await dst.run_sync(Base.metadata.create_all)
        for table in tables:
            if await dst.scalar(select(func.count()).select_from(table)):
                raise SystemExit(f"Hedef bos degil: {table.name}. Tasima durduruldu.")

    counts = {}
    # Tek islem: bir tablo patlarsa hedefte yarim veri kalmaz.
    async with source.connect() as src, target.begin() as dst:
        for table in tables:
            result = await src.stream(select(table))
            copied = 0
            async for batch in result.mappings().partitions(ROWS_PER_BATCH):
                await dst.execute(table.insert(), [dict(row) for row in batch])
                copied += len(batch)
            counts[table.name] = copied
            print(f"{table.name}: {copied}")

        for table in tables:
            for column in table.primary_key.columns:
                if isinstance(column.type, Integer) and column.autoincrement is not False:
                    await dst.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table.name}', '{column.name}'),"
                            f" GREATEST((SELECT MAX({column.name}) FROM {table.name}), 1))"
                            f" WHERE pg_get_serial_sequence('{table.name}', '{column.name}') IS NOT NULL"
                        )
                    )

    async with source.connect() as src, target.connect() as dst:
        for table in tables:
            n_src = await src.scalar(select(func.count()).select_from(table))
            n_dst = await dst.scalar(select(func.count()).select_from(table))
            if n_src != n_dst:
                raise SystemExit(f"Sayim tutmuyor: {table.name} {n_src} -> {n_dst}")

    await source.dispose()
    await target.dispose()
    print("Tamam, tum sayimlar tutuyor.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    asyncio.run(migrate(sys.argv[1], sys.argv[2]))
