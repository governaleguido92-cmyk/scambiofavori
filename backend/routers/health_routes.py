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
        "message": "Scambio Favori API v3.0",
        "status": "running",
        "currency": CURRENCY_NAME,
        "features": ["Emergenze Gentilezza", "Bacheca dei Grazie"]
    }

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

@api_router.get("/config")
async def public_config():
    """Cosa l'app deve sapere prima dell'accesso: oggi solo se il telefono va verificato alla registrazione."""
    return {"phone_verification_required": PHONE_VERIFICATION_REQUIRED}
