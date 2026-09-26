"""Istek siniri (slowapi). main.py ve router'lar ayni ornegi kullanir."""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# IP basina istek siniri. Her uca varsayilan bir tavan: anahtarsiz uclari
# (saglik, ilce listesi) dovmek Vercel maliyeti cikarmasin. Bellek ici ve
# ornek basina; dagitik saldiriya karsi Vercel'in kendi korumasi var.
# ponytail: bellek ici sayac; ortak sayac gerekirse Redis/Upstash deposu.
DEFAULT_RATE_LIMIT = "300/minute"


def client_ip(request: Request) -> str:
    """
    Vercel istemci IP'sini x-real-ip'e yaziyor (istemcinin gonderdigini
    ezerek); ASGI'nin gordugu adres ise Vercel'in kendi vekili. Yerelde
    baslik yoksa baglanti adresi.
    """
    return request.headers.get("x-real-ip") or get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    default_limits=[DEFAULT_RATE_LIMIT],
    enabled=settings.rate_limit_enabled,
)
