"""Avvisi per email al titolare quando serve moderare: allarmi di sicurezza, account in revisione, contenuti nascosti."""
import html
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import monthly_report
from core import logger

PANEL_URL = os.environ.get("MODERATION_PANEL_URL", "https://scambio-di-favori-api.onrender.com/api/admin/moderation/panel")


COOLDOWN = timedelta(hours=1)
_last_sent: dict = {}  # chiave -> quando è partita l'ultima email (si azzera al riavvio del server)


def _clean(line: str) -> str:
    """Il testo scritto dagli utenti entra nell'email senza a-capo e senza link cliccabili."""
    return re.sub(r"https?://\S+|www\.\S+", "[link]", re.sub(r"[\r\n]+", " ", str(line)))[:300]


async def notify_owner(subject: str, lines: list, key: Optional[str] = None) -> bool:
    """Manda una email breve al titolare, al massimo una all'ora per la stessa chiave (niente raffiche).
    Un errore non deve mai bloccare chi sta usando l'app."""
    now = datetime.now(timezone.utc)
    if key:
        last = _last_sent.get(key)
        if last and now - last < COOLDOWN:
            return False
        _last_sent[key] = now
    lines = [_clean(line) for line in lines]
    to = os.environ.get("MODERATION_EMAIL") or monthly_report.REPORT_EMAIL
    text = "\n".join([*lines, "", f"Apri il pannello di moderazione (serve il tuo codice): {PANEL_URL}"])
    body = "".join(f"<p>{html.escape(line)}</p>" for line in lines)
    page = (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">'
        f"{body}"
        f'<p><a href="{html.escape(PANEL_URL)}">Apri il pannello di moderazione</a> (serve il tuo codice)</p>'
        '<p style="color:#777;font-size:12px">Scambio Favori: avviso automatico per il titolare.</p></div>'
    )
    try:
        return bool(await monthly_report.send_email(f"Scambio Favori - {subject}", page, text, to))
    except Exception:
        logger.exception("Moderazione: invio dell'avviso non riuscito")
        return False
