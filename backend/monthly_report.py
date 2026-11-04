"""Rapporto mensile di Scambio Favori: solo numeri aggregati, mai nomi, email o testi dei messaggi."""
import asyncio
import os
from collections import Counter
from datetime import date, datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import resend

from core import RESEND_API_KEY, SENDER_EMAIL, logger

ROME = ZoneInfo("Europe/Rome")
REPORT_EMAIL = os.environ.get("MONTHLY_REPORT_EMAIL", "infoapp@scambiofavori.it")
TOP_CATEGORIES = 5
TOP_ZONES = 3
MONTH_NAMES = (
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
)


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """Inizio (incluso) e fine (esclusa) del mese secondo il calendario italiano, in UTC."""
    start = datetime(year, month, 1, tzinfo=ROME)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=ROME)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def previous_month(today: date) -> tuple[int, int]:
    return (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)


async def _count(collection: Any, field: str, window: dict, extra: Optional[dict] = None) -> int:
    return await collection.count_documents({field: window, **(extra or {})})


async def compute_month(db: Any, year: int, month: int) -> dict:
    start, end = month_bounds(year, month)
    window = {"$gte": start, "$lt": end}

    published = await db.favors.find({"created_at": window}, {"_id": 0}).to_list(100000)
    accepted = await db.favors.find({"accepted_at": window}, {"_id": 0}).to_list(100000)
    completed = await db.favors.find({"completed_at": window}, {"_id": 0}).to_list(100000)
    delivered = await db.messages.find({"created_at": window, "blocked": {"$ne": True}}, {"_id": 0, "sender_id": 1}).to_list(1000000)
    blocked = await db.messages.find({"created_at": window, "blocked": True}, {"_id": 0, "block_reason": 1}).to_list(1000000)
    sms_sent = await _count(db.phone_requests, "created_at", window)

    active = {f["creator_id"] for f in published} | {f["accepted_by"] for f in accepted if f.get("accepted_by")}
    active |= {m["sender_id"] for m in delivered if m.get("sender_id")}
    categories = Counter(f.get("category", "Altro") for f in published)
    zones = Counter(
        f"{round(f['approximate_latitude'], 1)}, {round(f['approximate_longitude'], 1)}"
        for f in published
        if f.get("approximate_latitude") is not None and f.get("approximate_longitude") is not None
    )
    price = os.environ.get("SMS_COST_EUR")

    return {
        "period": f"{year:04d}-{month:02d}",
        "label": f"{MONTH_NAMES[month - 1]} {year}",
        "utenti": {
            "nuovi_iscritti": await _count(db.users, "created_at", window),
            "attivi": len(active),
            "eliminati": await _count(db.account_deletions, "deleted_at", window),
            "telefoni_verificati": await _count(db.users, "phone_verified_at", window),
        },
        "favori": {
            "pubblicati": len(published),
            "accettati": len(accepted),
            "completati": len(completed),
            "annullati_dopo_accettazione": await _count(db.favors, "cancelled_at", window, {"cancelled_after_accept": True}),
            "ore_scambiate": round(sum(float(f.get("duration_hours") or 0) for f in completed), 1),
            "granelli_scambiati": int(sum(int(f.get("granelli_cost") or 0) for f in completed)),
            "categorie": [{"nome": n, "favori": c} for n, c in categories.most_common(TOP_CATEGORIES)],
            "zone": [{"zona": z, "favori": c} for z, c in zones.most_common(TOP_ZONES)],
        },
        "messaggi": {
            "inviati": len(delivered),
            "bloccati": dict(Counter(m.get("block_reason", "altro") for m in blocked)),
        },
        "sicurezza": {
            "segnalazioni": await _count(db.general_reports, "created_at", window),
            "allarmi_sicurezza": await _count(db.general_reports, "created_at", window, {"reason": "safety_alert"}),
            "blocchi_utenti": await _count(db.blocked_users, "created_at", window),
            "account_in_revisione": await _count(db.users, "safety_hold_at", window),
        },
        "sms": {
            "inviati": sms_sent,
            "costo_stimato_eur": round(sms_sent * float(price), 2) if price else None,
        },
    }


ROWS = (
    ("Utenti", (
        ("Nuovi iscritti", ("utenti", "nuovi_iscritti")),
        ("Utenti attivi", ("utenti", "attivi")),
        ("Telefoni verificati", ("utenti", "telefoni_verificati")),
        ("Account eliminati", ("utenti", "eliminati")),
    )),
    ("Favori", (
        ("Favori pubblicati", ("favori", "pubblicati")),
        ("Favori accettati", ("favori", "accettati")),
        ("Favori completati", ("favori", "completati")),
        ("Annullati dopo l'accettazione", ("favori", "annullati_dopo_accettazione")),
        ("Ore scambiate", ("favori", "ore_scambiate")),
        ("Granelli scambiati", ("favori", "granelli_scambiati")),
    )),
    ("Messaggi e sicurezza", (
        ("Messaggi inviati", ("messaggi", "inviati")),
        ("Segnalazioni", ("sicurezza", "segnalazioni")),
        ("Allarmi «Non mi sento al sicuro»", ("sicurezza", "allarmi_sicurezza")),
        ("Blocchi tra utenti", ("sicurezza", "blocchi_utenti")),
        ("Account in revisione", ("sicurezza", "account_in_revisione")),
    )),
    ("SMS", (("SMS inviati", ("sms", "inviati")),)),
)


def _get(report: dict, path: tuple) -> Any:
    return report[path[0]][path[1]]


def _blocked_text(report: dict) -> str:
    blocked = report["messaggi"]["bloccati"]
    return ", ".join(f"{k}: {v}" for k, v in sorted(blocked.items())) or "nessuno"


def render_report(report: dict) -> tuple[str, str, str]:
    """Oggetto, versione HTML con tabella e versione testo dell'email."""
    subject = f"Scambio Favori - rapporto di {report['label']}"
    cost = report["sms"]["costo_stimato_eur"]
    cost_text = f"{cost:.2f} €" if cost is not None else "n.d."
    categories = ", ".join(f"{c['nome']} ({c['favori']})" for c in report["favori"]["categorie"]) or "nessuna"
    zones = ", ".join(f"{z['zona']} ({z['favori']})" for z in report["favori"]["zone"]) or "nessuna"

    html_rows, text_lines = [], [subject, ""]
    for title, rows in ROWS:
        html_rows.append(f'<tr><th colspan="2" style="text-align:left;background:#2D5A3D;color:#fff;padding:8px">{title}</th></tr>')
        text_lines.append(title.upper())
        for label, path in rows:
            value = _get(report, path)
            html_rows.append(f'<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd">{label}</td>'
                             f'<td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right"><b>{value}</b></td></tr>')
            text_lines.append(f"{label}: {value}")
        text_lines.append("")
    extras = (
        ("Messaggi bloccati dal filtro", _blocked_text(report)),
        ("Costo stimato degli SMS", cost_text),
        ("Categorie più richieste", categories),
        ("Zone (celle di circa 10 km)", zones),
    )
    html_rows.append('<tr><th colspan="2" style="text-align:left;background:#2D5A3D;color:#fff;padding:8px">Dettagli</th></tr>')
    text_lines.append("DETTAGLI")
    for label, value in extras:
        html_rows.append(f'<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd">{label}</td>'
                         f'<td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">{value}</td></tr>')
        text_lines.append(f"{label}: {value}")

    html = (
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">'
        f'<h2 style="color:#2D5A3D">Scambio Favori - {report["label"]}</h2>'
        '<table style="width:100%;border-collapse:collapse;font-size:14px">' + "".join(html_rows) + "</table>"
        '<p style="color:#777;font-size:12px">Solo numeri aggregati: nessun nome, email o testo dei messaggi.</p></div>'
    )
    return subject, html, "\n".join(text_lines)


async def send_email(subject: str, html: str, text: str, to: str) -> bool:
    if not RESEND_API_KEY:
        logger.info("[EMAIL MOCK] %s -> %s", subject, to)
        return False
    params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html, "text": text}
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception:
        logger.exception("Rapporto mensile: invio email non riuscito")
        return False
