from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import __version__
from app.auth import verify_admin_key
from app.config import settings
from app.database import init_db
from app.limits import limiter
from app.middleware import MetricsMiddleware
from app.routers import (
    account,
    admin,
    dashboard,
    districts,
    export,
    health,
    metrics,
    presets,
    saved,
    search,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialise storage on boot.

    Onceden burada run_warmup() arka plan gorevi baslatiliyordu: her
    acilista 20 es zamanli Overpass sorgusu atiyordu ve Overpass IP
    basina 2 slot verdigi icin sik yeniden baslatilan ortamlarda kotayi
    tuketip aynalari sagliksiz isaretliyordu.

    Yerine app/ingest.py geldi: elle calistirilan, kaldigi yerden devam
    eden, 80 ilcenin tamamini kapsayan bir CLI. Startup'ta hicbir ag
    cagrisi yapilmiyor.
    """
    await init_db()
    yield


# FastAPI app instance
app = FastAPI(
    title="Rota API",
    description="Enterprise-ready backend using Overpass API",
    version=__version__,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)




# Add metrics middleware
app.add_middleware(MetricsMiddleware)

# CORS middleware
#
# Liste artik ayardan geliyor. Onceden burada sabit ["...:3000", "...:3001"]
# vardi; CORS_ORIGINS hem docker-compose'da hem .env.example'da tanimliydi,
# config.py onu okuyup ayristiriyordu ama sonuc hicbir yerde kullanilmiyordu.
# Yani ayar goruntude vardi, gercekte yoktu - ustelik sabit liste dev
# sunucusunun asil portunu (3004) icermiyordu.
#
# Pratikte CORS bu uygulamada devreye girmiyor: tarayici backend'e dogrudan
# gitmiyor, tum istekler Next.js sunucusundan geciyor. Ama backend disariya
# acilirsa dogru davranmasi gerekiyor.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include API routers
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(dashboard.router, prefix="/api", tags=["dashboard"])
app.include_router(export.router)
# account.router kendi /api prefix'ini tasiyor (export gibi)
app.include_router(account.router)
app.include_router(saved.router)
# districts.router kendi /api/districts prefix'ini tasiyor
app.include_router(districts.router)
app.include_router(presets.router, prefix="/api", tags=["presets"])
app.include_router(admin.router)
# Ic isleyis sayaclari (uc adlari, gecikmeler): yalniz yonetici.
app.include_router(metrics.router, dependencies=[Depends(verify_admin_key)])
app.include_router(health.router)

# Eski statik yonetim paneli (/admin/ui) kaldirildi: kimliksiz sunuluyordu,
# kendi giris akisi da calismiyordu. Yonetim arayuzu web'deki /admin.


# Legacy @app.get("/health") removed in favor of app.routers.health


@app.get("/")
@limiter.limit("60/minute")
async def root(request: Request) -> dict:
    """
    Root endpoint with API info.

    Returns:
        API information
    """
    return {
        "name": "FastAPI OSM Backend",
        "version": __version__,
        "health": "/health/ready",
    }
