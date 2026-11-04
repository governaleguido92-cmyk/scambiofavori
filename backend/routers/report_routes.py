"""HTTP routes: rapporto mensile, chiamato ogni 1° del mese da un'attività programmata di GitHub."""
import os
import secrets
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header
from pydantic import BaseModel

from core import *  # noqa: F401,F403
import monthly_report

api_router = APIRouter(prefix="/api")


class MonthlyReportBody(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    force: bool = False  # rimanda l'email anche se il rapporto è già stato inviato


@api_router.post("/admin/monthly-report")
async def run_monthly_report(body: Optional[MonthlyReportBody] = None, x_report_token: Optional[str] = Header(default=None)):
    """Calcola il rapporto del mese (di default quello appena finito), lo salva e lo invia per email, una sola volta."""
    expected = os.environ.get("MONTHLY_REPORT_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Rapporto mensile non configurato")
    if not x_report_token or not secrets.compare_digest(x_report_token, expected):
        raise HTTPException(status_code=401, detail="Non autorizzato")

    body = body or MonthlyReportBody()
    year, month = (body.year, body.month) if body.year and body.month else monthly_report.previous_month(date.today())
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        raise HTTPException(status_code=400, detail="Mese non valido")

    report = await monthly_report.compute_month(db, year, month)
    saved = await db.monthly_reports.find_one({"period": report["period"]}, {"_id": 0, "emailed_at": 1})
    already_sent = bool(saved and saved.get("emailed_at"))

    email_sent = False
    if body.force or not already_sent:
        subject, html, text = monthly_report.render_report(report)
        email_sent = await monthly_report.send_email(subject, html, text, monthly_report.REPORT_EMAIL)

    now = datetime.now(timezone.utc)
    update = {**report, "generated_at": now}
    if email_sent:
        update["emailed_at"] = now
    await db.monthly_reports.update_one({"period": report["period"]}, {"$set": update}, upsert=True)
    return {"period": report["period"], "email_sent": email_sent, "report": report}
