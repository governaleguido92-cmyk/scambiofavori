"""HTTP routes: Quartiere, la chat tra chi ha un favore attivo entro 30 km. I messaggi durano 2 giorni."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from core import *  # noqa: F401,F403
import moderation_notify
import trust
import weather
from public_text import ensure_public_text_allowed

api_router = APIRouter(prefix="/api")

AREA_RADIUS_KM = 30
MESSAGE_LIFETIME = timedelta(days=2)
MAX_MESSAGE_LENGTH = 300
MAX_MESSAGES_PER_MINUTE = 6
HIDE_AFTER_REPORTS = 3
MAX_MESSAGES_PER_READ = 200
DISTANCE_STEP_KM = 5  # la distanza si mostra arrotondata, mai la posizione


class AreaMessageBody(BaseModel):
    content: str


class AreaReportBody(BaseModel):
    reason: Optional[str] = None


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


async def _reference_points(user_id: str) -> list:
    """Posizioni (approssimate) dei favori ancora aperti di una persona: da lì si calcola il raggio di 30 km."""
    now = datetime.now(timezone.utc)
    favors = await db.favors.find({
        "status": {"$in": ["active", "accepted"]},
        "$or": [{"creator_id": user_id}, {"accepted_by": user_id}],
    }, {"_id": 0, "approximate_latitude": 1, "approximate_longitude": 1, "expires_at": 1, "status": 1}).to_list(100)
    points = []
    for favor in favors:
        if favor.get("approximate_latitude") is None or favor.get("approximate_longitude") is None:
            continue
        expires = favor.get("expires_at")
        if favor["status"] == "active" and expires and _aware(expires) < now:
            continue
        points.append((favor["approximate_latitude"], favor["approximate_longitude"]))
    return points


async def _require_access(user_id: str) -> list:
    points = await _reference_points(user_id)
    if not points:
        raise HTTPException(
            status_code=403,
            detail="Il quartiere è aperto a chi ha un favore attivo: pubblica o accetta un favore per entrare.",
        )
    return points


def _nearest_km(point: tuple, others: list) -> float:
    return min(calculate_distance(point[0], point[1], lat, lon) for lat, lon in others)


@api_router.get("/area-chat")
async def read_area_chat(since: Optional[str] = Query(default=None), current_user: User = Depends(get_current_user)):
    """Messaggi degli ultimi 2 giorni di chi ha un favore attivo entro 30 km."""
    points = await _require_access(current_user.user_id)
    now = datetime.now(timezone.utc)
    cutoff = now - MESSAGE_LIFETIME
    if since:
        try:
            cutoff = max(cutoff, _aware(datetime.fromisoformat(since.replace("Z", "+00:00"))))
        except ValueError:
            raise HTTPException(status_code=400, detail="Data non valida")

    blocked = await get_blocked_user_ids(current_user.user_id)
    candidates = await db.area_messages.find(
        {"created_at": {"$gt": cutoff}, "hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    visible = []
    for message in candidates:
        if message["author_id"] in blocked or _aware(message["expires_at"]) <= now:
            continue
        mine = message["author_id"] == current_user.user_id
        distance = _nearest_km((message["latitude"], message["longitude"]), points)
        if not mine and distance > AREA_RADIUS_KM:
            continue
        visible.append({
            "message_id": message["message_id"],
            "author_id": message["author_id"],
            "author_name": message["author_name"],
            "content": message["content"],
            "created_at": _aware(message["created_at"]).isoformat(),
            "mine": mine,
            "distance_km": None if mine else max(DISTANCE_STEP_KM, round(distance / DISTANCE_STEP_KM) * DISTANCE_STEP_KM),
            "off_app_contact": bool(message.get("off_app_contact")),
        })
        if len(visible) >= MAX_MESSAGES_PER_READ:
            break
    visible.reverse()  # dal più vecchio al più recente
    return {"messages": visible, "radius_km": AREA_RADIUS_KM}


@api_router.post("/area-chat")
async def write_area_chat(body: AreaMessageBody, current_user: User = Depends(get_current_user)):
    points = await _require_access(current_user.user_id)
    await trust.ensure_not_on_hold(current_user.user_id)

    content = body.content.strip()
    ensure_public_text_allowed(content, MAX_MESSAGE_LENGTH)

    now = datetime.now(timezone.utc)
    recent = await db.area_messages.count_documents({"author_id": current_user.user_id, "created_at": {"$gt": now - timedelta(minutes=1)}})
    if recent >= MAX_MESSAGES_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Stai scrivendo troppo in fretta: aspetta un minuto.")

    message = {
        "message_id": f"area_{uuid.uuid4().hex[:12]}",
        "author_id": current_user.user_id,
        "author_name": current_user.name,
        "content": content,
        "latitude": points[0][0],
        "longitude": points[0][1],
        "off_app_contact": contains_off_app_contact(content),
        "hidden": False,
        "created_at": now,
        "expires_at": now + MESSAGE_LIFETIME,
    }
    await db.area_messages.insert_one(message)
    await ensure_area_indexes()
    await update_last_activity(current_user.user_id)
    return {"message_id": message["message_id"], "created_at": now.isoformat()}


@api_router.post("/area-chat/{message_id}/report")
@limiter.limit("20/minute")
async def report_area_message(request: Request, message_id: str, body: AreaReportBody, current_user: User = Depends(get_current_user)):
    await _require_access(current_user.user_id)
    message = await db.area_messages.find_one({"message_id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Messaggio non trovato")
    if message["author_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi segnalare il tuo messaggio")
    if await db.general_reports.find_one({"reporter_id": current_user.user_id, "report_type": "area_message", "target_id": message_id}):
        raise HTTPException(status_code=400, detail="Hai già segnalato questo messaggio")

    await db.general_reports.insert_one({
        "report_id": f"greport_{uuid.uuid4().hex[:12]}",
        "reporter_id": current_user.user_id,
        "report_type": "area_message",
        "target_id": message_id,
        "reported_user_id": message["author_id"],
        "reason": (body.reason or "inappropriate")[:40],
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    })
    reporters = await db.general_reports.distinct("reporter_id", {"report_type": "area_message", "target_id": message_id})
    if await trust.trusted_reporter_count(reporters) >= HIDE_AFTER_REPORTS and not message.get("hidden"):
        await db.area_messages.update_one({"message_id": message_id}, {"$set": {"hidden": True}})
        await moderation_notify.notify_owner("Messaggio nascosto dopo 3 segnalazioni", [
            f"Il messaggio «{message['content'][:80]}» di {message['author_name']} è stato nascosto automaticamente."], key=f"hide:{message_id}")
    return {"message": "Segnalazione inviata. Grazie per aiutarci a tenere il quartiere sicuro."}


_indexes_ready = False


async def ensure_area_indexes() -> None:
    """Indice che fa cancellare da MongoDB i messaggi scaduti (si crea una volta sola, al primo messaggio)."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.area_messages.create_index("expires_at", expireAfterSeconds=0)
        await db.area_messages.create_index("created_at")
        _indexes_ready = True
    except Exception:  # non deve mai impedire di scrivere un messaggio
        logger.exception("Indice dei messaggi di zona non creato")


@api_router.get("/neighborhood/weather")
async def neighborhood_weather(current_user: User = Depends(get_current_user)):
    """Meteo del quartiere, dalla posizione approssimata dei favori aperti (o, in mancanza, del profilo)."""
    points = await _reference_points(current_user.user_id)
    if not points:
        doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "approximate_latitude": 1, "approximate_longitude": 1})
        if doc and doc.get("approximate_latitude") is not None and doc.get("approximate_longitude") is not None:
            points = [(doc["approximate_latitude"], doc["approximate_longitude"])]
    if not points:
        return {"weather": None, "reason": "no_position"}
    try:
        return {"weather": await weather.get_weather(points[0][0], points[0][1])}
    except weather.WeatherUnavailable:
        logger.warning("Meteo non disponibile per il quartiere")
        return {"weather": None, "reason": "unavailable"}
