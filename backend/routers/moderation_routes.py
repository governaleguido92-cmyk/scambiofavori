"""HTTP routes: pannello di moderazione del titolare (segnalazioni da leggere e gestire), protetto da un codice."""
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from core import *  # noqa: F401,F403
from routers.moderation_panel_page import PANEL_HTML

api_router = APIRouter(prefix="/api/admin/moderation")

MIN_TOKEN_LENGTH = 20
MAX_REPORTS = 300
UNAVAILABLE = "(contenuto non più disponibile)"

# tipo di segnalazione -> (collezione, chiave, etichetta, campo che riassume il contenuto, campo del proprietario)
TARGETS = {
    "user": ("users", "user_id", "Utente", "name", "user_id"),
    "favor": ("favors", "favor_id", "Favore", "title", "creator_id"),
    "area_message": ("area_messages", "message_id", "Messaggio del quartiere", "content", "author_id"),
    "neighborhood_notice": ("neighborhood_notices", "notice_id", "Avviso del quartiere", "text", "author_id"),
    "neighborhood_event": ("neighborhood_events", "event_id", "Evento del quartiere", "title", "author_id"),
    "neighborhood_intro": ("neighborhood_intros", "intro_id", "Presentazione", "text", "author_id"),
}
HIDEABLE = {"area_message", "neighborhood_notice", "neighborhood_event", "neighborhood_intro", "favor"}
ACTIONS = ("dismiss", "hide_content", "hold_user", "release_user")


class ActionBody(BaseModel):
    action: str
    note: Optional[str] = None


def moderator_emails() -> set:
    """Email dei moderatori: le sceglie solo il titolare, con una variabile del server."""
    return {e.strip().lower() for e in (os.environ.get("MODERATOR_EMAILS") or "").split(",") if e.strip()}


def is_moderator_account(email: Optional[str], email_verified: bool) -> bool:
    """Il ruolo vale solo con l'email nell'elenco E verificata: chi si registra con l'email di un altro non lo ottiene."""
    return bool(email) and bool(email_verified) and email.strip().lower() in moderator_emails()


async def moderator_access(request: Request, token: Optional[str]) -> str:
    """Entra chi ha il codice di moderazione oppure ha un account moderatore. Ritorna chi è, per il registro."""
    if token is not None:
        expected = (os.environ.get("MODERATION_TOKEN") or "").strip()
        if len(expected) < MIN_TOKEN_LENGTH:
            raise HTTPException(status_code=503, detail="Pannello di moderazione non configurato")
        if not secrets.compare_digest(token.strip().encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="Non autorizzato")
        return "codice"
    user = await get_current_user(request)  # 401 se non ha fatto l'accesso
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "email_verified": 1}) or {}
    if not is_moderator_account(doc.get("email"), doc.get("email_verified")):
        raise HTTPException(status_code=403, detail="Account non abilitato alla moderazione")
    return user.user_id


async def _names(user_ids: set) -> dict:
    users = await db.users.find({"user_id": {"$in": list(user_ids)}}, {"_id": 0, "user_id": 1, "name": 1, "safety_hold": 1}).to_list(1000)
    return {u["user_id"]: u for u in users}


async def _collect() -> list:
    """Tutte le segnalazioni (nuove e vecchie) in un unico formato, senza dati di contatto."""
    general = await db.general_reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(MAX_REPORTS)
    chat = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(MAX_REPORTS)

    items = []
    for doc in general:
        kind = TARGETS.get(doc["report_type"])
        target = {"kind": doc["report_type"], "label": doc["report_type"], "summary": UNAVAILABLE, "id": doc["target_id"]}
        owner_id = None
        if kind:
            collection, key, label, field, owner_field = kind
            content = await getattr(db, collection).find_one({key: doc["target_id"]}, {"_id": 0})
            target.update(label=label)
            if content:
                target["summary"] = str(content.get(field) or UNAVAILABLE)[:300]
                owner_id = content.get(owner_field)
            if doc["report_type"] == "user":
                owner_id = doc["target_id"]
        items.append({
            "report_id": doc["report_id"], "source": "general", "status": doc.get("status", "pending"),
            "priority": doc.get("priority", "normal"), "reason": doc.get("reason"), "description": doc.get("description"),
            "created_at": doc["created_at"], "reporter_id": doc.get("reporter_id"), "favor_id": doc.get("favor_id"),
            "target": {**target, "kind": target["label"], "type": doc["report_type"]}, "owner_id": owner_id,
        })
    for doc in chat:
        items.append({
            "report_id": doc["report_id"], "source": "chat", "status": doc.get("status", "pending"), "priority": "normal",
            "reason": doc.get("reason"), "description": doc.get("description"), "created_at": doc["created_at"],
            "reporter_id": doc.get("reporter_id"), "favor_id": doc.get("favor_id"),
            "target": {"kind": "Messaggio nella chat del favore", "type": "chat", "id": doc.get("favor_id"), "summary": doc.get("description") or "(vedi favore)"},
            "owner_id": doc.get("reported_user_id"),
        })

    names = await _names({i["reporter_id"] for i in items if i["reporter_id"]} | {i["owner_id"] for i in items if i["owner_id"]})
    totals = {}
    for item in items:
        if item["owner_id"]:
            totals[item["owner_id"]] = totals.get(item["owner_id"], 0) + 1
    for item in items:
        reporter = names.get(item["reporter_id"], {})
        owner = names.get(item["owner_id"], {})
        item["reporter_name"] = reporter.get("name") or "(utente cancellato)"
        item["reported_user"] = {
            "user_id": item["owner_id"], "name": owner.get("name") or "(utente cancellato)",
            "safety_hold": bool(owner.get("safety_hold")), "reports_total": totals.get(item["owner_id"], 0),
        } if item["owner_id"] else None
        item["created_at"] = item["created_at"].isoformat() if hasattr(item["created_at"], "isoformat") else item["created_at"]
        del item["owner_id"], item["reporter_id"]
    return items


@api_router.get("/panel", response_class=HTMLResponse)
async def panel_page():
    """La pagina non contiene dati: li carica dopo che il titolare ha scritto il suo codice."""
    return HTMLResponse(PANEL_HTML, headers={
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; "
                                   "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    })


@api_router.get("/me")
@limiter.limit("60/minute")
async def moderator_me(request: Request, current_user: User = Depends(get_current_user)):
    """Dice all'app se questo account è un moderatore (non svela chi lo è, solo la risposta per sé)."""
    doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "email": 1, "email_verified": 1}) or {}
    return {"moderator": is_moderator_account(doc.get("email"), doc.get("email_verified"))}


@api_router.get("/reports")
@limiter.limit("60/minute")
async def list_reports(request: Request, status: str = "pending", x_moderation_token: Optional[str] = Header(default=None)):
    await moderator_access(request, x_moderation_token)
    items = await _collect()
    if status != "all":
        items = [i for i in items if i["status"] == status]
    items.sort(key=lambda i: i["created_at"], reverse=True)
    items.sort(key=lambda i: i["priority"] != "high")
    return {"reports": items}


@api_router.get("/held-users")
@limiter.limit("60/minute")
async def held_users(request: Request, x_moderation_token: Optional[str] = Header(default=None)):
    await moderator_access(request, x_moderation_token)
    users = await db.users.find({"safety_hold": True}, {"_id": 0, "user_id": 1, "name": 1, "safety_hold_at": 1}).to_list(500)
    result = []
    for user in users:
        alerts = await db.general_reports.count_documents({"report_type": "user", "target_id": user["user_id"], "reason": "safety_alert"})
        held_at = user.get("safety_hold_at")
        result.append({"user_id": user["user_id"], "name": user.get("name"), "alerts": alerts,
                       "held_at": held_at.isoformat() if hasattr(held_at, "isoformat") else None})
    return {"users": result}


@api_router.post("/reports/{report_id}/action")
@limiter.limit("60/minute")
async def report_action(report_id: str, body: ActionBody, request: Request, x_moderation_token: Optional[str] = Header(default=None)):
    moderator = await moderator_access(request, x_moderation_token)
    if body.action not in ACTIONS:
        raise HTTPException(status_code=400, detail="Azione non valida")
    item = next((i for i in await _collect() if i["report_id"] == report_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Segnalazione non trovata")
    if item["status"] != "pending":
        raise HTTPException(status_code=409, detail="Segnalazione già gestita")

    target, owner = item["target"], item["reported_user"]
    now = datetime.now(timezone.utc)
    if body.action == "hide_content":
        if target["type"] not in HIDEABLE:
            raise HTTPException(status_code=400, detail="Questo tipo di segnalazione non ha un contenuto da nascondere")
        if target["type"] == "favor" and not await db.favors.find_one({"favor_id": target["id"], "status": "active"}, {"_id": 1}):
            raise HTTPException(status_code=400, detail="Il favore non è più aperto: non si può nascondere")
    if body.action in ("hold_user", "release_user"):
        if not owner or not owner["user_id"] or not await db.users.find_one({"user_id": owner["user_id"]}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="Utente non trovato")

    # La segnalazione si "prenota" in un solo passaggio: due moderatori insieme non fanno la stessa azione due volte.
    note = (body.note or "").strip()[:500] or None
    if item["source"] == "chat":
        status = "dismissed" if body.action == "dismiss" else "confirmed"
        claim = await db.reports.update_one({"report_id": report_id, "status": "pending"},
                                            {"$set": {"status": status, "resolved_at": now, "resolution_note": note}})
    else:
        status = "dismissed" if body.action == "dismiss" else "resolved"
        claim = await db.general_reports.update_one({"report_id": report_id, "status": "pending"}, {"$set": {
            "status": status, "resolved_at": now, "resolution_action": body.action, "resolution_note": note}})
    if claim.matched_count == 0:
        raise HTTPException(status_code=409, detail="Segnalazione già gestita")

    if body.action == "hide_content":
        collection, key = TARGETS[target["type"]][:2]
        change = {"status": "hidden_reported", "hidden_at": now} if target["type"] == "favor" else {"hidden": True}
        await getattr(db, collection).update_one({key: target["id"]}, {"$set": change})
    elif body.action == "hold_user":
        await db.users.update_one({"user_id": owner["user_id"]}, {"$set": {"safety_hold": True, "safety_hold_at": now}})
    elif body.action == "release_user":
        await db.users.update_one({"user_id": owner["user_id"]}, {"$set": {"safety_hold": False, "shadow_banned": False, "banned_from_chat": False}})
    await db.moderation_actions.insert_one({
        "action_id": f"modact_{uuid.uuid4().hex[:12]}", "report_id": report_id, "action": body.action, "target_type": target["type"],
        "target_id": target["id"], "user_id": owner["user_id"] if owner else None, "note": note, "by": moderator, "created_at": now,
    })
    return {"status": status}
