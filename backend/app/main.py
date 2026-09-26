from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app import __version__
from app.config import settings
from app.database import init_db
from app.middleware import MetricsMiddleware
from app.routers import (
    account,
    admin,
    districts,
    export,
    health,
    metrics,
    presets,
    saved,
    search,
)

# Rate limiter setup (IP-based)
limiter = Limiter(key_func=get_remote_address)

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
    docs_url="/docs",
    redoc_url="/redoc",
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

# Include API routers
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(export.router)
# account.router kendi /api prefix'ini tasiyor (export gibi)
app.include_router(account.router)
app.include_router(saved.router)
# districts.router kendi /api/districts prefix'ini tasiyor
app.include_router(districts.router)
app.include_router(presets.router, prefix="/api", tags=["presets"])
app.include_router(admin.router)
app.include_router(metrics.router)
app.include_router(health.router)

# Mount admin panel
app.mount("/admin/ui", StaticFiles(directory="app/static", html=True), name="admin_ui")


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
        "docs": "/docs",
        "health": "/health/ready",
    }
