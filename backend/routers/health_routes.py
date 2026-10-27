"""HTTP routes: health."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403

api_router = APIRouter(prefix="/api")

# ========================
# HEALTH CHECK
# ========================

@api_router.get("/")
async def root():
    return {
        "message": "Scambio di Favori API v3.0",
        "status": "running",
        "currency": CURRENCY_NAME,
        "features": ["Muro del Quartiere", "Oggettoteca", "Emergenze Gentilezza", "Bacheca dei Grazie"]
    }

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}
