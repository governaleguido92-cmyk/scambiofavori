"""Fiducia e sicurezza: livelli, limiti per i nuovi utenti, coppie ripetute, garanzie e blocco di sicurezza.

Il livello è sempre calcolato dal server, mai dal client:
  0  telefono non verificato (solo se la verifica SMS è obbligatoria)
  1  base
  2  almeno 3 favori completati e valutazione media non bassa
  3  livello 2 + documento verificato
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from core import PHONE_VERIFICATION_REQUIRED, db

FAVORS_FOR_LEVEL_TWO = 3
MIN_RATING_FOR_LEVEL_TWO = 3.5
NEW_USER_MAX_OPEN_FAVORS = 3  # favori che il nuovo utente chiede, aperti insieme
NEW_USER_MAX_ACCEPTED_FAVORS = 5  # favori che il nuovo utente sta aiutando, aperti insieme
NEW_USER_MAX_GRANELLI_COST = 3
PAIR_WEEKLY_LIMIT = 2
PAIR_WINDOW_DAYS = 7
VOUCH_MONTHLY_LIMIT = 3
VOUCH_WINDOW_DAYS = 30
VOUCH_MAX_PENALTIES = 2
SAFETY_HOLD_ALERTS = 2
SAFETY_WINDOW_DAYS = 90
REMINDER_COOLDOWN_HOURS = 24
OPEN_STATUSES = ("active", "accepted")


def completed_favors_total(user_doc: dict) -> int:
    return int(user_doc.get("total_favors_given", 0)) + int(user_doc.get("total_favors_received", 0))


def trust_level(user_doc: dict) -> int:
    phone_ok = bool(user_doc.get("phone_verified")) or not PHONE_VERIFICATION_REQUIRED
    if not phone_ok:
        return 0
    rating = float(user_doc.get("average_rating") or 0)
    rating_ok = rating == 0 or rating >= MIN_RATING_FOR_LEVEL_TWO
    if completed_favors_total(user_doc) < FAVORS_FOR_LEVEL_TWO or not rating_ok:
        return 1
    return 3 if user_doc.get("identity_verified") else 2


def is_new_user(user_doc: dict) -> bool:
    return trust_level(user_doc) < 2


async def user_doc_of(user_id: str) -> dict:
    return await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}


async def count_open_favors(user_id: str, role: str) -> int:
    """Favori aperti dell'utente: role "creator" = che ha chiesto, "accepted_by" = che sta aiutando."""
    return await db.favors.count_documents({"status": {"$in": list(OPEN_STATUSES)}, role: user_id})


async def ensure_not_on_hold(user_id: str) -> None:
    if (await user_doc_of(user_id)).get("safety_hold"):
        raise HTTPException(
            status_code=403,
            detail="Il tuo account è in revisione per segnalazioni di sicurezza. Scrivi al supporto per informazioni.",
        )


async def ensure_new_user_can_create(user_id: str, granelli_cost: int, is_emergency: bool) -> None:
    """I nuovi utenti hanno favori piccoli e pochi alla volta. Le emergenze non hanno limiti."""
    if is_emergency or not is_new_user(await user_doc_of(user_id)):
        return
    if granelli_cost > NEW_USER_MAX_GRANELLI_COST:
        raise HTTPException(
            status_code=403,
            detail=f"Per i nuovi utenti i favori durano al massimo {NEW_USER_MAX_GRANELLI_COST} ore. "
                   f"Completa {FAVORS_FOR_LEVEL_TWO} favori per sbloccare tutto.",
        )
    await ensure_new_user_open_slot(user_id)


async def ensure_new_user_open_slot(user_id: str) -> None:
    """Limite sui favori che il nuovo utente CHIEDE: chi vuole aiutare non viene frenato da questo."""
    if not is_new_user(await user_doc_of(user_id)):
        return
    if await count_open_favors(user_id, "creator_id") >= NEW_USER_MAX_OPEN_FAVORS:
        raise HTTPException(
            status_code=403,
            detail=f"Per i nuovi utenti al massimo {NEW_USER_MAX_OPEN_FAVORS} favori aperti alla volta. "
                   f"Completa {FAVORS_FOR_LEVEL_TWO} favori per sbloccare tutto.",
        )


async def ensure_new_user_can_accept(user_id: str) -> None:
    """Limite più largo sui favori che il nuovo utente sta aiutando, per fermare chi li accaparra senza presentarsi."""
    if not is_new_user(await user_doc_of(user_id)):
        return
    if await count_open_favors(user_id, "accepted_by") >= NEW_USER_MAX_ACCEPTED_FAVORS:
        raise HTTPException(
            status_code=403,
            detail=f"Per i nuovi utenti al massimo {NEW_USER_MAX_ACCEPTED_FAVORS} favori da aiutare alla volta. "
                   f"Completa {FAVORS_FOR_LEVEL_TWO} favori per sbloccare tutto.",
        )


async def ensure_pair_not_overused(user_id: str, other_id: str) -> None:
    """Limita i favori tra le stesse due persone, per fermare scambi finti fatti per guadagnare granelli."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=PAIR_WINDOW_DAYS)
    pair = [
        {"creator_id": user_id, "accepted_by": other_id},
        {"creator_id": other_id, "accepted_by": user_id},
    ]
    open_count = await db.favors.count_documents({"status": "accepted", "$or": pair})
    done_count = await db.favors.count_documents({"status": "completed", "completed_at": {"$gte": cutoff}, "$or": pair})
    if open_count + done_count >= PAIR_WEEKLY_LIMIT:
        raise HTTPException(
            status_code=403,
            detail=f"Hai già fatto {PAIR_WEEKLY_LIMIT} favori con la stessa persona questa settimana. "
                   "Aiuta anche altri vicini: riprova tra qualche giorno.",
        )


async def reputation_stats(user_id: str) -> dict:
    completed = await db.favors.count_documents({
        "status": "completed", "$or": [{"creator_id": user_id}, {"accepted_by": user_id}],
    })
    late = await db.favors.count_documents({
        "status": "cancelled", "cancelled_by": user_id, "cancelled_after_accept": True,
    })
    total = completed + late
    return {
        "completed": completed,
        "late_cancellations": late,
        "cancel_rate": round(late / total, 2) if total else 0.0,
    }


async def vouch_count(user_id: str) -> int:
    return await db.vouches.count_documents({"vouchee_id": user_id})


async def apply_safety_hold_if_needed(target_id: str) -> bool:
    """Con 2 allarmi da persone diverse l'account passa in revisione e chi lo ha garantito perde fiducia."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=SAFETY_WINDOW_DAYS)
    alerts = await db.general_reports.find(
        {"reason": "safety_alert", "target_id": target_id, "created_at": {"$gte": cutoff}}, {"reporter_id": 1}
    ).to_list(100)
    if len({alert["reporter_id"] for alert in alerts}) < SAFETY_HOLD_ALERTS:
        return False
    if (await user_doc_of(target_id)).get("safety_hold"):
        return True
    await db.users.update_one(
        {"user_id": target_id}, {"$set": {"safety_hold": True, "safety_hold_at": datetime.now(timezone.utc)}}
    )
    for vouch in await db.vouches.find({"vouchee_id": target_id}).to_list(100):
        await db.users.update_one({"user_id": vouch["voucher_id"]}, {"$inc": {"vouch_penalties": 1}})
    return True


def next_level_hint(user_doc: dict) -> Optional[int]:
    level = trust_level(user_doc)
    if level == 1:
        return max(0, FAVORS_FOR_LEVEL_TWO - completed_favors_total(user_doc))
    return None


async def trusted_reporter_count(reporter_ids: list) -> int:
    """Quante delle persone che hanno segnalato hanno un account vero (email o telefono verificati).
    Tre account usa e getta non devono bastare per nascondere i contenuti di qualcuno."""
    if not reporter_ids:
        return 0
    return await db.users.count_documents({
        "user_id": {"$in": list(reporter_ids)},
        "$or": [{"email_verified": True}, {"phone_verified": True}],
    })
