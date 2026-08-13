"""
Gelistirme icin baslangic API anahtari uretir.

Onceden sabit "ak_test_key_12345" anahtarini ekliyordu. Tahmin edilebilir
bir anahtar, script'in calistirildigi her ortamda (yanlislikla uretim
dahil) gecerli bir erisim demekti. Artik rastgele uretiliyor ve yalnizca
bir kez, olusturuldugu anda ekrana yaziliyor; veritabaninda sadece
SHA256 ozeti duruyor.

Anahtari sabitlemek gerekiyorsa (orn. otomatik testler) SEED_API_KEY
ortam degiskeniyle acikca verilebilir.
"""

import asyncio
import os
import secrets

from sqlalchemy import select

from app.auth import hash_key
from app.database import APIKey, AsyncSessionLocal, init_db

KEY_NAME = os.getenv("SEED_KEY_NAME", "default")


async def seed_api_key():
    print("Initializing database...")
    await init_db()

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(APIKey).where(APIKey.name == KEY_NAME))
        existing = result.scalar_one_or_none()

        if existing:
            # Ozetten duz anahtari geri uretmek mumkun degil; yenisi
            # isteniyorsa mevcut kayit silinmeli ya da baska bir ad
            # (SEED_KEY_NAME) kullanilmali.
            print(f"'{KEY_NAME}' adli anahtar zaten var, yenisi uretilmedi.")
            return

        plain_key = os.getenv("SEED_API_KEY") or f"ak_{secrets.token_urlsafe(32)}"

        session.add(
            APIKey(
                key_hash=hash_key(plain_key),
                name=KEY_NAME,
                daily_limit=int(os.getenv("SEED_DAILY_LIMIT", "1000")),
                plan=os.getenv("SEED_PLAN", "pro"),
            )
        )
        await session.commit()

        print("Anahtar olusturuldu. Bu deger yalnizca simdi gosteriliyor:")
        print(f"  {plain_key}")
        print("Frontend icin .env.local dosyasina SEARCH_API_KEY olarak ekleyin.")


if __name__ == "__main__":
    asyncio.run(seed_api_key())
