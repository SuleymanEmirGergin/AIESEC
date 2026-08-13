import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app import __version__
from app.database import init_db
from app.middleware import MetricsMiddleware
from app.routers import account, admin, export, health, metrics, presets, search
from app.services.warmup import run_warmup


# Rate limiter setup (IP-based)
limiter = Limiter(key_func=get_remote_address)

# FastAPI app instance
app = FastAPI(
    title="Nearby Place Finder API",
    description="Enterprise-ready backend using Overpass API",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.on_event("startup")
async def startup_event():
    """Initialise storage and security policies on boot."""
    await init_db()
    
    # Trigger background warmup (No session passed, warmup creates its own)
    asyncio.create_task(run_warmup())

# Add metrics middleware
app.add_middleware(MetricsMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
