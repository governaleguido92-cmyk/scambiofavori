"""HTTP routes: eventi e ritrovi del quartiere (con "ci vado") e presentazioni dei nuovi vicini (con "benvenuto")."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from core import *  # noqa: F401,F403
import moderation_notify
import trust
from public_text import ensure_public_text_allowed
from routers import area_chat_routes as chat
from routers.neighborhood_routes import _position_points, _round_distance

api_router = APIRouter(prefix="/api")

EVENT_KINDS = ("evento", "ritrovo")
EVENT_TITLE_MAX = 60
EVENT_DESCRIPTION_MAX = 200
EVENT_PLACE_MAX = 60
EVENT_MAX_DAYS_AHEAD = 30
EVENT_GRACE = timedelta(hours=2)  # un evento resta visibile ancora un po' dopo l'inizio
EVENT_KEEP = timedelta(hours=6)
MAX_OPEN_EVENTS_PER_USER = 2
INTRO_MAX = 200
INTRO_LIFETIME = timedelta(days=14)
HIDE_AFTER_REPORTS = 3


class EventBody(BaseModel):
    kind: str
    title: str
    description: Optional[str] = ""
    place: str
    starts_at: str


class IntroBody(BaseModel):
    text: str


class ReportBody(BaseModel):
    reason: Optional[str] = None


def _parse_start(value: str) -> datetime:
    try:
        start = chat._aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        raise HTTPException(status_code=400, detail="Data e ora non valide")
    now = datetime.now(timezone.utc)
    if start <= now:
        raise HTTPException(status_code=400, detail="L'inizio deve essere nel futuro")
    if start > now + timedelta(days=EVENT_MAX_DAYS_AHEAD):
        raise HTTPException(status_code=400, detail=f"Si può organizzare al massimo {EVENT_MAX_DAYS_AHEAD} giorni prima")
    return start


async def _points_or_403(user_id: str, detail: str) -> list:
    points = await _position_points(user_id)
    if not points:
        raise HTTPException(status_code=403, detail=detail)
    return points


async def _report(item: dict, id_key: str, report_type: str, collection, reporter_id: str, reason: Optional[str]) -> dict:
    if item["author_id"] == reporter_id:
        raise HTTPException(status_code=400, detail="Non puoi segnalare un tuo contenuto")
    if await db.general_reports.find_one({"reporter_id": reporter_id, "report_type": report_type, "target_id": item[id_key]}):
        raise HTTPException(status_code=400, detail="Hai già segnalato questo contenuto")
    await db.general_reports.insert_one({
        "report_id": f"greport_{uuid.uuid4().hex[:12]}", "reporter_id": reporter_id, "report_type": report_type,
        "target_id": item[id_key], "reported_user_id": item["author_id"], "reason": (reason or "inappropriate")[:40],
        "status": "pending", "created_at": datetime.now(timezone.utc),
    })
    reporters = await db.general_reports.distinct("reporter_id", {"report_type": report_type, "target_id": item[id_key]})
    if await trust.trusted_reporter_count(reporters) >= HIDE_AFTER_REPORTS and not item.get("hidden"):
        await collection.update_one({id_key: item[id_key]}, {"$set": {"hidden": True}})
        await moderation_notify.notify_owner("Contenuto nascosto dopo 3 segnalazioni", [
            f"{item.get('title') or item.get('text', '')[:80]} (di {item['author_name']}) è stato nascosto automaticamente."],
            key=f"hide:{item[id_key]}")
    return {"message": "Segnalazione inviata. Grazie per aiutarci a tenere il quartiere sicuro."}


# ---------- eventi e ritrovi ----------

@api_router.get("/neighborhood/events")
async def list_events(current_user: User = Depends(get_current_user)):
    """Eventi e ritrovi in arrivo entro 30 km."""
    points = await _position_points(current_user.user_id)
    if not points:
        return {"events": [], "reason": "no_position"}
    now = datetime.now(timezone.utc)
    blocked = await get_blocked_user_ids(current_user.user_id)
    result = []
    for event in await db.neighborhood_events.find(
        {"starts_at": {"$gte": now - EVENT_GRACE}, "hidden": {"$ne": True}}, {"_id": 0}
    ).sort("starts_at", 1).to_list(200):
        if event["author_id"] in blocked:
            continue
        mine = event["author_id"] == current_user.user_id
        distance = chat._nearest_km((event["latitude"], event["longitude"]), points)
        if not mine and distance > chat.AREA_RADIUS_KM:
            continue
        attendees = event.get("attendees", [])
        result.append({
            "event_id": event["event_id"], "kind": event["kind"], "title": event["title"],
            "description": event.get("description", ""), "place": event["place"],
            "starts_at": chat._aware(event["starts_at"]).isoformat(), "author_id": event["author_id"],
            "author_name": event["author_name"], "mine": mine, "attendees": len(attendees),
            "going": current_user.user_id in attendees, "distance_km": None if mine else _round_distance(distance),
        })
    return {"events": result}


@api_router.post("/neighborhood/events")
async def create_event(body: EventBody, current_user: User = Depends(get_current_user)):
    points = await chat._require_access(current_user.user_id)
    await trust.ensure_not_on_hold(current_user.user_id)
    if body.kind not in EVENT_KINDS:
        raise HTTPException(status_code=400, detail="Tipo non valido")
    title, place, description = body.title.strip(), body.place.strip(), (body.description or "").strip()
    ensure_public_text_allowed(title, EVENT_TITLE_MAX)
    ensure_public_text_allowed(place, EVENT_PLACE_MAX)
    if description:
        ensure_public_text_allowed(description, EVENT_DESCRIPTION_MAX)
    start = _parse_start(body.starts_at)

    now = datetime.now(timezone.utc)
    open_events = await db.neighborhood_events.count_documents({"author_id": current_user.user_id, "starts_at": {"$gte": now}})
    if open_events >= MAX_OPEN_EVENTS_PER_USER:
        raise HTTPException(status_code=429, detail=f"Puoi avere al massimo {MAX_OPEN_EVENTS_PER_USER} eventi in programma.")

    event = {
        "event_id": f"event_{uuid.uuid4().hex[:12]}", "author_id": current_user.user_id, "author_name": current_user.name,
        "kind": body.kind, "title": title, "description": description, "place": place, "starts_at": start,
        "expires_at": start + EVENT_KEEP, "latitude": points[0][0], "longitude": points[0][1],
        "attendees": [], "hidden": False, "created_at": now,
    }
    await db.neighborhood_events.insert_one(event)
    await _ensure_indexes()
    return {"event_id": event["event_id"]}


@api_router.post("/neighborhood/events/{event_id}/join")
@limiter.limit("20/minute")
async def toggle_join(request: Request, event_id: str, current_user: User = Depends(get_current_user)):
    event = await db.neighborhood_events.find_one({"event_id": event_id, "hidden": {"$ne": True}}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    if event["author_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Sei tu a organizzarlo")
    if chat._aware(event["starts_at"]) < datetime.now(timezone.utc) - EVENT_GRACE:
        raise HTTPException(status_code=400, detail="L'evento è già finito")
    points = await _points_or_403(current_user.user_id, "Serve una posizione per partecipare.")
    if chat._nearest_km((event["latitude"], event["longitude"]), points) > chat.AREA_RADIUS_KM:
        raise HTTPException(status_code=403, detail="Questo evento è troppo lontano da te")

    going = current_user.user_id not in event.get("attendees", [])
    operator = "$addToSet" if going else "$pull"
    await db.neighborhood_events.update_one({"event_id": event_id}, {operator: {"attendees": current_user.user_id}})
    if going and not event.get("counted_for_badge") and not event.get("attendees"):
        # Il primo ospite fa valere l'evento per il badge dell'organizzatore (una volta sola per evento)
        await db.neighborhood_events.update_one({"event_id": event_id}, {"$set": {"counted_for_badge": True}})
        await db.users.update_one({"user_id": event["author_id"]}, {"$inc": {"events_with_guests": 1}})
        await check_and_award_badges(event["author_id"])
    return {"going": going}


@api_router.delete("/neighborhood/events/{event_id}")
async def delete_event(event_id: str, current_user: User = Depends(get_current_user)):
    event = await db.neighborhood_events.find_one({"event_id": event_id}, {"_id": 0, "author_id": 1})
    if not event:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    if event["author_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Puoi cancellare solo i tuoi eventi")
    await db.neighborhood_events.delete_one({"event_id": event_id})
    return {"message": "Evento cancellato"}


@api_router.post("/neighborhood/events/{event_id}/report")
@limiter.limit("20/minute")
async def report_event(request: Request, event_id: str, body: ReportBody, current_user: User = Depends(get_current_user)):
    event = await db.neighborhood_events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    return await _report(event, "event_id", "neighborhood_event", db.neighborhood_events, current_user.user_id, body.reason)


# ---------- presentazioni dei nuovi vicini ----------

@api_router.get("/neighborhood/intros")
async def list_intros(current_user: User = Depends(get_current_user)):
    """Presentazioni degli ultimi 14 giorni di chi abita entro 30 km."""
    points = await _position_points(current_user.user_id)
    if not points:
        return {"intros": [], "reason": "no_position"}
    now = datetime.now(timezone.utc)
    blocked = await get_blocked_user_ids(current_user.user_id)
    result = []
    for intro in await db.neighborhood_intros.find(
        {"created_at": {"$gt": now - INTRO_LIFETIME}, "hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200):
        if intro["author_id"] in blocked:
            continue
        mine = intro["author_id"] == current_user.user_id
        distance = chat._nearest_km((intro["latitude"], intro["longitude"]), points)
        if not mine and distance > chat.AREA_RADIUS_KM:
            continue
        welcomed_by = intro.get("welcomed_by", [])
        result.append({
            "intro_id": intro["intro_id"], "author_id": intro["author_id"], "author_name": intro["author_name"],
            "text": intro["text"], "mine": mine, "welcomes": len(welcomed_by),
            "welcomed": current_user.user_id in welcomed_by, "created_at": chat._aware(intro["created_at"]).isoformat(),
            "distance_km": None if mine else _round_distance(distance),
        })
    return {"intros": result}


@api_router.put("/neighborhood/intro")
async def write_intro(body: IntroBody, current_user: User = Depends(get_current_user)):
    """Una presentazione a testa: se ne scrivi una nuova sostituisce la vecchia."""
    points = await _points_or_403(current_user.user_id, "Per presentarti serve la tua zona: pubblica un favore o imposta la posizione nel profilo.")
    await trust.ensure_not_on_hold(current_user.user_id)
    text = body.text.strip()
    ensure_public_text_allowed(text, INTRO_MAX)

    await db.neighborhood_intros.delete_many({"author_id": current_user.user_id})
    now = datetime.now(timezone.utc)
    intro = {
        "intro_id": f"intro_{uuid.uuid4().hex[:12]}", "author_id": current_user.user_id, "author_name": current_user.name,
        "text": text, "latitude": points[0][0], "longitude": points[0][1], "welcomed_by": [], "hidden": False,
        "created_at": now, "expires_at": now + INTRO_LIFETIME,
    }
    await db.neighborhood_intros.insert_one(intro)
    await _ensure_indexes()
    return {"intro_id": intro["intro_id"]}


@api_router.delete("/neighborhood/intro")
async def withdraw_intro(current_user: User = Depends(get_current_user)):
    await db.neighborhood_intros.delete_many({"author_id": current_user.user_id})
    return {"message": "Presentazione ritirata"}


@api_router.post("/neighborhood/intros/{intro_id}/welcome")
@limiter.limit("20/minute")
async def toggle_welcome(request: Request, intro_id: str, current_user: User = Depends(get_current_user)):
    intro = await db.neighborhood_intros.find_one({"intro_id": intro_id, "hidden": {"$ne": True}}, {"_id": 0})
    if not intro:
        raise HTTPException(status_code=404, detail="Presentazione non trovata")
    if intro["author_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi dare il benvenuto a te stesso")
    points = await _points_or_403(current_user.user_id, "Serve una posizione per dare il benvenuto.")
    if chat._nearest_km((intro["latitude"], intro["longitude"]), points) > chat.AREA_RADIUS_KM:
        raise HTTPException(status_code=403, detail="Questa persona è troppo lontana da te")

    welcomed = current_user.user_id not in intro.get("welcomed_by", [])
    operator = "$addToSet" if welcomed else "$pull"
    await db.neighborhood_intros.update_one({"intro_id": intro_id}, {operator: {"welcomed_by": current_user.user_id}})
    # Il conteggio dei benvenuti dati sale e scende con il tasto, ma non va sotto zero
    await db.users.update_one({"user_id": current_user.user_id}, {"$inc": {"welcomes_given": 1 if welcomed else -1}})
    await db.users.update_one({"user_id": current_user.user_id, "welcomes_given": {"$lt": 0}}, {"$set": {"welcomes_given": 0}})
    if welcomed:
        await check_and_award_badges(current_user.user_id)
    return {"welcomed": welcomed}


@api_router.post("/neighborhood/intros/{intro_id}/report")
@limiter.limit("20/minute")
async def report_intro(request: Request, intro_id: str, body: ReportBody, current_user: User = Depends(get_current_user)):
    intro = await db.neighborhood_intros.find_one({"intro_id": intro_id}, {"_id": 0})
    if not intro:
        raise HTTPException(status_code=404, detail="Presentazione non trovata")
    return await _report(intro, "intro_id", "neighborhood_intro", db.neighborhood_intros, current_user.user_id, body.reason)


# ---------- pulizia ----------

async def delete_user_social_data(user_id: str) -> None:
    """Cancellazione account: via eventi e presentazioni della persona, e la sua adesione agli eventi altrui."""
    await db.neighborhood_events.delete_many({"author_id": user_id})
    await db.neighborhood_intros.delete_many({"author_id": user_id})
    await db.neighborhood_events.update_many({"attendees": user_id}, {"$pull": {"attendees": user_id}})
    await db.neighborhood_intros.update_many({"welcomed_by": user_id}, {"$pull": {"welcomed_by": user_id}})


_indexes_ready = False


async def _ensure_indexes() -> None:
    """Fa cancellare da MongoDB eventi e presentazioni scaduti (si crea una volta sola)."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.neighborhood_events.create_index("expires_at", expireAfterSeconds=0)
        await db.neighborhood_intros.create_index("expires_at", expireAfterSeconds=0)
        _indexes_ready = True
    except Exception:
        logger.exception("Indici di eventi e presentazioni del quartiere non creati")
