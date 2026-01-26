import asyncio
import os
import secrets
from app.database import APIKey, init_db, AsyncSessionLocal
from app.auth import hash_key
from sqlalchemy import select

async def seed_api_key():
    print("Initializing database...")
    await init_db()
    
    async with AsyncSessionLocal() as session:
        # Check if any key exists
        result = await session.execute(select(APIKey).where(APIKey.name == "default"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"Default API key already exists for: {existing.name}")
            return
            
        plain_key = "ak_test_key_12345"
        key_h = hash_key(plain_key)
        
        new_key = APIKey(
            key_hash=key_h,
            name="default",
            daily_limit=1000,
            plan="pro",
        )
        session.add(new_key)
        await session.commit()
        print(f"Seeded API key: {plain_key}")

if __name__ == "__main__":
    asyncio.run(seed_api_key())
