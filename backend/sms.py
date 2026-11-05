"""Invio di SMS (Twilio) e normalizzazione dei numeri di telefono."""
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")
_SEPARATORS = re.compile(r"[\s\-().]")
ITALY_PREFIX = "+39"


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Numero in formato internazionale (+39…), oppure None se non è valido.

    Accetta "345 064 0166", "+39 345…", "0039 345…" e numeri esteri con il +.
    I numeri senza prefisso che iniziano per 3 (cellulari italiani) ricevono +39.
    """
    if not raw:
        return None
    compact = _SEPARATORS.sub("", raw.strip())
    if compact.startswith("00"):
        compact = "+" + compact[2:]
    elif not compact.startswith("+") and compact.isdigit() and compact.startswith("3") and 9 <= len(compact) <= 10:
        compact = ITALY_PREFIX + compact
    return compact if _E164.match(compact) else None


VERIFY_BASE_URL = "https://verify.twilio.com/v2/Services"
VERIFY_TIMEOUT_SECONDS = 10


def verify_enabled() -> bool:
    """True se è configurato il servizio Twilio Verify (codice generato e controllato da Twilio)."""
    return all(os.environ.get(n) for n in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"))


def _twilio_error(response: httpx.Response) -> tuple:
    """Codice e messaggio d'errore di Twilio (non contengono segreti né il numero), per capire perché un invio fallisce."""
    try:
        body = response.json()
        return body.get("code"), str(body.get("message", ""))[:200]
    except ValueError:
        return None, ""


async def _verify_call(endpoint: str, data: dict) -> Optional[dict]:
    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    service_sid = os.environ["TWILIO_VERIFY_SERVICE_SID"]
    try:
        async with httpx.AsyncClient(timeout=VERIFY_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{VERIFY_BASE_URL}/{service_sid}/{endpoint}",
                auth=(account_sid, os.environ["TWILIO_AUTH_TOKEN"]),
                data=data,
            )
    except httpx.HTTPError:
        logger.exception("Twilio Verify: network error on %s", endpoint)
        return None
    if response.status_code not in (200, 201):
        code, message = _twilio_error(response)
        logger.error("Twilio Verify %s answered %s (codice %s): %s", endpoint, response.status_code, code, message)
        return None
    return response.json()


async def verify_start(to: str) -> bool:
    """Chiede a Twilio di inviare il codice SMS a `to`."""
    return await _verify_call("Verifications", {"To": to, "Channel": "sms", "Locale": "it"}) is not None


async def verify_check(to: str, code: str) -> bool:
    """True se Twilio conferma che `code` è corretto per `to`."""
    result = await _verify_call("VerificationCheck", {"To": to, "Code": code})
    return bool(result) and result.get("status") == "approved"


async def send_sms(to: str, body: str) -> bool:
    """Invia un SMS con Twilio. Senza credenziali scrive il testo nei log (sviluppo) e restituisce False."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    sender = os.environ.get("TWILIO_FROM")
    messaging_service = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
    if not (account_sid and auth_token and (sender or messaging_service)):
        logger.info("[SMS MOCK] SMS non inviato (Twilio non configurato)")
        return False

    payload = {"To": to, "Body": body}
    if messaging_service:
        payload["MessagingServiceSid"] = messaging_service
    else:
        payload["From"] = sender
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                auth=(account_sid, auth_token),
                data=payload,
            )
        if response.status_code not in (200, 201):
            logger.error("SMS not sent: Twilio answered %s", response.status_code)
            return False
        return True
    except httpx.HTTPError:
        logger.exception("SMS not sent: network error")
        return False
