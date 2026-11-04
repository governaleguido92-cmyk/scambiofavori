"""HTTP routes: avvisi del quartiere, pubblicati da chi ha un favore attivo (durano 3 giorni)."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from core import *  # noqa: F401,F403
import trust
from public_text import ensure_public_text_allowed
from routers import area_chat_routes as chat

api_router = APIRouter(prefix="/api")

NOTICE_CATEGORIES = ("lavori", "smarrito", "evento", "sicurezza", "altro")
NOTICE_LIFETIME = timedelta(days=3)
NOTICE_MAX_LENGTH = 200
MAX_NOTICES_PER_DAY = 3
HIDE_AFTER_REPORTS = 3


class NoticeBody(BaseModel):
    category: str
    text: str


class ReportBody(BaseModel):
    reason: Optional[str] = None


def _round_distance(km: float) -> int:
    return max(chat.DISTANCE_STEP_KM, round(km / chat.DISTANCE_STEP_KM) * chat.DISTANCE_STEP_KM)


async def _position_points(user_id: str) -> list:
    points = await chat._reference_points(user_id)
    if points:
        return points
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "approximate_latitude": 1, "approximate_longitude": 1})
    if doc and doc.get("approximate_latitude") is not None and doc.get("approximate_longitude") is not None:
        return [(doc["approximate_latitude"], doc["approximate_longitude"])]
    return []


@api_router.get("/neighborhood/news")
async def neighborhood_news(current_user: User = Depends(get_current_user)):
    """Avvisi dei vicini entro 30 km dai favori aperti (o dalla posizione del profilo)."""
    points = await _position_points(current_user.user_id)
    if not points:
        return {"notices": [], "reason": "no_position"}
    now = datetime.now(timezone.utc)
    blocked = await get_blocked_user_ids(current_user.user_id)

    notices = []
    for notice in await db.neighborhood_notices.find(
        {"expires_at": {"$gt": now}, "hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(300):
        if notice["author_id"] in blocked:
            continue
        mine = notice["author_id"] == current_user.user_id
        distance = chat._nearest_km((notice["latitude"], notice["longitude"]), points)
        if not mine and distance > chat.AREA_RADIUS_KM:
            continue
        notices.append({
            "notice_id": notice["notice_id"], "author_id": notice["author_id"], "author_name": notice["author_name"],
            "category": notice["category"], "text": notice["text"], "mine": mine,
            "created_at": chat._aware(notice["created_at"]).isoformat(),
            "distance_km": None if mine else _round_distance(distance),
        })
    return {"notices": notices}


@api_router.post("/neighborhood/notices")
async def publish_notice(body: NoticeBody, current_user: User = Depends(get_current_user)):
    points = await chat._require_access(current_user.user_id)
    await trust.ensure_not_on_hold(current_user.user_id)
    if body.category not in NOTICE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")
    text = body.text.strip()
    ensure_public_text_allowed(text, NOTICE_MAX_LENGTH)

    now = datetime.now(timezone.utc)
    today = await db.neighborhood_notices.count_documents({"author_id": current_user.user_id, "created_at": {"$gt": now - timedelta(days=1)}})
    if today >= MAX_NOTICES_PER_DAY:
        raise HTTPException(status_code=429, detail=f"Puoi pubblicare al massimo {MAX_NOTICES_PER_DAY} avvisi al giorno.")

    notice = {
        "notice_id": f"notice_{uuid.uuid4().hex[:12]}", "author_id": current_user.user_id, "author_name": current_user.name,
        "category": body.category, "text": text, "latitude": points[0][0], "longitude": points[0][1],
        "hidden": False, "created_at": now, "expires_at": now + NOTICE_LIFETIME,
    }
    await db.neighborhood_notices.insert_one(notice)
    await _ensure_indexes()
    return {"notice_id": notice["notice_id"]}


@api_router.delete("/neighborhood/notices/{notice_id}")
async def delete_notice(notice_id: str, current_user: User = Depends(get_current_user)):
    notice = await db.neighborhood_notices.find_one({"notice_id": notice_id}, {"_id": 0, "author_id": 1})
    if not notice:
        raise HTTPException(status_code=404, detail="Avviso non trovato")
    if notice["author_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Puoi cancellare solo i tuoi avvisi")
    await db.neighborhood_notices.delete_one({"notice_id": notice_id})
    return {"message": "Avviso cancellato"}


@api_router.post("/neighborhood/notices/{notice_id}/report")
async def report_notice(notice_id: str, body: ReportBody, current_user: User = Depends(get_current_user)):
    notice = await db.neighborhood_notices.find_one({"notice_id": notice_id}, {"_id": 0})
    if not notice:
        raise HTTPException(status_code=404, detail="Avviso non trovato")
    if notice["author_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi segnalare il tuo avviso")
    if await db.general_reports.find_one({"reporter_id": current_user.user_id, "report_type": "neighborhood_notice", "target_id": notice_id}):
        raise HTTPException(status_code=400, detail="Hai già segnalato questo avviso")
    await db.general_reports.insert_one({
        "report_id": f"greport_{uuid.uuid4().hex[:12]}", "reporter_id": current_user.user_id, "report_type": "neighborhood_notice",
        "target_id": notice_id, "reported_user_id": notice["author_id"], "reason": (body.reason or "inappropriate")[:40],
        "status": "pending", "created_at": datetime.now(timezone.utc),
    })
    reporters = await db.general_reports.distinct("reporter_id", {"report_type": "neighborhood_notice", "target_id": notice_id})
    if len(reporters) >= HIDE_AFTER_REPORTS:
        await db.neighborhood_notices.update_one({"notice_id": notice_id}, {"$set": {"hidden": True}})
    return {"message": "Segnalazione inviata. Grazie per aiutarci a tenere il quartiere sicuro."}


_indexes_ready = False


async def _ensure_indexes() -> None:
    """Fa cancellare da MongoDB gli avvisi scaduti (si crea una volta sola)."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.neighborhood_notices.create_index("expires_at", expireAfterSeconds=0)
        _indexes_ready = True
    except Exception:
        logger.exception("Indici degli avvisi del quartiere non creati")
