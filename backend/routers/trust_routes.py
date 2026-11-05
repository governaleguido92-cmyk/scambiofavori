"""HTTP routes: fiducia, reputazione, garanzie, allarme sicurezza e sollecito di conferma."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from core import *  # noqa: F401,F403
import moderation_notify
import trust

api_router = APIRouter(prefix="/api")

EMERGENCY_NUMBER = "112"


class SafetyAlertBody(BaseModel):
    description: Optional[str] = None


def _resolve(user_id: str, current_user) -> str:
    return current_user.user_id if user_id == "me" else user_id


@api_router.get("/users/me/trust")
async def my_trust(current_user: User = Depends(get_current_user)):
    doc = await trust.user_doc_of(current_user.user_id)
    return {
        "trust_level": trust.trust_level(doc),
        "is_new_user": trust.is_new_user(doc),
        "favors_to_next_level": trust.next_level_hint(doc),
        "max_open_favors": trust.NEW_USER_MAX_OPEN_FAVORS if trust.is_new_user(doc) else None,
        "max_hours": trust.NEW_USER_MAX_GRANELLI_COST if trust.is_new_user(doc) else None,
        "vouch_count": await trust.vouch_count(current_user.user_id),
        "safety_hold": bool(doc.get("safety_hold")),
    }


@api_router.get("/users/{user_id}/reputation")
async def user_reputation(user_id: str, current_user: User = Depends(get_current_user)):
    target_id = _resolve(user_id, current_user)
    if not await db.users.find_one({"user_id": target_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return await trust.reputation_stats(target_id)


@api_router.post("/users/{user_id}/vouch")
async def vouch_for_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Garantire per un vicino che si conosce di persona."""
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi garantire per te stesso")
    voucher = await trust.user_doc_of(current_user.user_id)
    if trust.trust_level(voucher) < 2:
        raise HTTPException(status_code=403, detail="Puoi garantire per qualcuno dopo aver completato almeno 3 favori")
    if voucher.get("safety_hold") or voucher.get("vouch_penalties", 0) >= trust.VOUCH_MAX_PENALTIES:
        raise HTTPException(status_code=403, detail="Al momento non puoi garantire per altri utenti")
    if not await db.users.find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if user_id in await get_blocked_user_ids(current_user.user_id):
        raise HTTPException(status_code=403, detail="Non puoi garantire per questo utente")
    if await db.vouches.find_one({"voucher_id": current_user.user_id, "vouchee_id": user_id}):
        raise HTTPException(status_code=400, detail="Hai già garantito per questo utente")
    cutoff = datetime.now(timezone.utc) - timedelta(days=trust.VOUCH_WINDOW_DAYS)
    recent = await db.vouches.count_documents({"voucher_id": current_user.user_id, "created_at": {"$gte": cutoff}})
    if recent >= trust.VOUCH_MONTHLY_LIMIT:
        raise HTTPException(status_code=429, detail=f"Puoi garantire per al massimo {trust.VOUCH_MONTHLY_LIMIT} persone al mese")
    await db.vouches.insert_one({
        "vouch_id": f"vouch_{uuid.uuid4().hex[:12]}",
        "voucher_id": current_user.user_id,
        "vouchee_id": user_id,
        "created_at": datetime.now(timezone.utc),
    })
    return {"message": "Grazie! Hai garantito per questo vicino.", "vouch_count": await trust.vouch_count(user_id)}


@api_router.post("/favors/{favor_id}/safety-alert")
async def safety_alert(favor_id: str, body: SafetyAlertBody, current_user: User = Depends(get_current_user)):
    """«Non mi sento al sicuro»: chiude il favore, blocca l'altro e manda una segnalazione prioritaria."""
    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    if current_user.user_id not in (favor["creator_id"], favor.get("accepted_by")):
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    other_id = favor.get("accepted_by") if favor["creator_id"] == current_user.user_id else favor["creator_id"]
    if not other_id:
        raise HTTPException(status_code=400, detail="Nessun altro partecipante da segnalare")

    now = datetime.now(timezone.utc)
    if favor["status"] in ("accepted", "active"):
        await db.favors.update_one(
            {"favor_id": favor_id},
            {"$set": {"status": "cancelled", "safety_alert": True, "cancelled_by": current_user.user_id,
                      "cancelled_after_accept": False, "cancelled_at": now}},
        )
    await db.general_reports.insert_one({
        "report_id": f"greport_{uuid.uuid4().hex[:12]}",
        "reporter_id": current_user.user_id,
        "report_type": "user",
        "target_id": other_id,
        "reason": "safety_alert",
        "priority": "high",
        "favor_id": favor_id,
        "description": (body.description or "")[:500] or None,
        "status": "pending",
        "created_at": now,
    })
    if not await db.blocked_users.find_one({"blocker_id": current_user.user_id, "blocked_id": other_id}):
        await db.blocked_users.insert_one({
            "block_id": f"block_{uuid.uuid4().hex[:12]}",
            "blocker_id": current_user.user_id,
            "blocked_id": other_id,
            "reason": "safety_alert",
            "created_at": now,
        })
    on_hold = await trust.apply_safety_hold_if_needed(other_id)
    other = await db.users.find_one({"user_id": other_id}, {"_id": 0, "name": 1}) or {}
    await moderation_notify.notify_owner(
        "Account in revisione per sicurezza" if on_hold else "Allarme di sicurezza",
        [f"{current_user.name} ha premuto «Non mi sento al sicuro» su {other.get('name') or other_id} (id {other_id}).",
         f"Motivo scritto: {(body.description or 'nessuno')[:200]}",
         "L'account è stato messo in revisione automatica (2 allarmi da persone diverse)." if on_hold else "Il favore è stato chiuso e le due persone non si vedono più."],
        key=f"{'hold' if on_hold else 'alert'}:{other_id}",
    )
    return {
        "message": "Segnalazione inviata. Il favore è chiuso e non vedrai più questa persona.",
        "emergency_number": EMERGENCY_NUMBER,
        "other_on_hold": on_hold,
    }


@api_router.post("/favors/{favor_id}/remind-confirmation")
async def remind_confirmation(favor_id: str, current_user: User = Depends(get_current_user)):
    """Chi ha aiutato può ricordare, una volta al giorno, a chi ha ricevuto il favore di confermarlo."""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    if favor_doc["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Il favore non è in attesa di conferma")
    helper_id, payer_id = favor_parties(Favor(**favor_doc))
    if helper_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo chi ha aiutato può mandare il promemoria")
    last = favor_doc.get("confirmation_reminded_at")
    now = datetime.now(timezone.utc)
    if last:
        last = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
        if now - last < timedelta(hours=trust.REMINDER_COOLDOWN_HOURS):
            raise HTTPException(status_code=429, detail="Hai già mandato un promemoria oggi. Riprova domani.")
    await db.favors.update_one({"favor_id": favor_id}, {"$set": {"confirmation_reminded_at": now}})
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": payer_id,
        "type": "confirmation_reminder",
        "title": "Conferma il favore",
        "message": f"{current_user.name} aspetta la tua conferma per \"{favor_doc['title']}\"",
        "related_id": favor_id,
        "read": False,
        "created_at": now,
    })
    await send_push_notification(
        payer_id, "Conferma il favore", f"{current_user.name} aspetta la tua conferma",
        {"favor_id": favor_id, "type": "confirmation_reminder"},
    )
    return {"message": "Promemoria inviato"}
