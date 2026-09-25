"""Enterprise authentication and quota enforcement."""

import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import APIKey, get_db


def get_admin_api_key() -> str:
    """Get admin API key from environment."""
    api_key = os.getenv("ADMIN_API_KEY")
    if not api_key:
        raise ValueError("ADMIN_API_KEY not set in environment")
    return api_key


async def verify_admin_key(x_admin_key: Optional[str] = Header(None)) -> None:
    """
    Verify admin API key from X-ADMIN-KEY header.

    Raises:
        HTTPException: 401 if key is missing or invalid
    """
    expected = get_admin_api_key()
    if not x_admin_key or x_admin_key != expected:
        raise HTTPException(
            status_code=401, detail="Invalid or missing admin API key (X-ADMIN-KEY)"
        )


async def verify_admin_token(authorization: Optional[str] = Header(None)) -> None:
    """
    Verify admin Bearer token (backward compatibility for legacy UI).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid auth format")

    if parts[1] != get_admin_api_key():
        raise HTTPException(status_code=401, detail="Invalid admin token")


def hash_key(key: str) -> str:
    """SHA256 hash for storing API keys securely."""
    return hashlib.sha256(key.encode()).hexdigest()


# LOCAL_MODE'da dondurulen sanal anahtar.
#
# Veritabaninda karsiligi yok ve olmasi da gerekmiyor: kota sayaci
# islemedigi icin hicbir alani guncellenmiyor. Modul seviyesinde tek
# ornek olmasi bilincli - testler used_today'in artmadigini bu ornek
# uzerinden dogruluyor.
LOCAL_API_KEY = APIKey(
    name="local",
    key_hash="local-mode",
    is_active=True,
    plan="enterprise",
    daily_limit=10**9,
    used_today=0,
    last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
)


async def _get_api_key_obj(x_api_key: str, db: AsyncSession) -> APIKey:
    """Internal helper to find and validate API key object."""
    key_h = hash_key(x_api_key)
    result = await db.execute(select(APIKey).where(APIKey.key_hash == key_h))
    key_obj = result.scalar_one_or_none()

    if not key_obj or not key_obj.is_active:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")
    return key_obj


async def validate_api_key(
    x_api_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)
) -> APIKey:
    """Validate key exists and is active, without incrementing usage."""
    # LOCAL_MODE anahtari ZORUNLU olmaktan cikariyor, kimligi atmiyor.
    # Anahtar geldiyse gercek kayit donuyor: kayitli yerler ve listeler
    # takima api_key_id ile bagli, sanal anahtarin id'si yok ve kaydetme
    # NOT NULL ihlaliyle 500 veriyordu. Web sunucusu her istekte
    # SEARCH_API_KEY gonderiyor.
    if settings.local_mode and not x_api_key:
        return LOCAL_API_KEY

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-KEY required")
    return await _get_api_key_obj(x_api_key, db)


async def verify_api_key(
    x_api_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)
) -> APIKey:
    """
    Anahtari dogrular. Plan ve gunluk kota yok: onayli her kullanici
    her seyi yapabiliyor (kapali ekip araci).
    """
    if settings.local_mode:
        return LOCAL_API_KEY

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-KEY required")

    return await _get_api_key_obj(x_api_key, db)
