"""Router for the caller's own API key state."""

from fastapi import APIRouter, Depends

from app.auth import validate_api_key
from app.database import APIKey
from app.models import APIKeyResponse

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/me", response_model=APIKeyResponse)
async def get_own_key(api_key: APIKey = Depends(validate_api_key)):
    """
    Return the plan and quota state of the presented X-API-KEY.

    Neden gerekli: CSV export 'free' planda 403, kota dolunca 429
    donuyordu. Istemcinin bunu onceden bilmesinin hicbir yolu yoktu,
    kullanici butona basip hatayi sonradan goruyordu. Bu uc sayesinde
    arayuz butonu gerekcesiyle birlikte devre disi birakabiliyor.

    validate_api_key kullaniliyor (verify_api_key degil): durum sorgusu
    kota harcamamali.
    """
    return APIKeyResponse(
        name=api_key.name,
        is_active=api_key.is_active,
        daily_limit=api_key.daily_limit,
        used_today=api_key.used_today,
        last_reset_date=api_key.last_reset_date,
        plan=api_key.plan,
    )
