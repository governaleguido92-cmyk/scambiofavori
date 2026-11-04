"""Rotta protetta che il 1° del mese calcola e invia il rapporto."""
import monthly_report as mr
from routers import report_routes

URL = "/api/admin/monthly-report"


async def test_route_is_off_without_a_token_configured(client, monkeypatch):
    monkeypatch.delenv("MONTHLY_REPORT_TOKEN", raising=False)
    response = await client.post(URL, headers={"X-Report-Token": "qualcosa"})
    assert response.status_code == 503


async def test_wrong_or_missing_token_is_refused(client, monkeypatch):
    monkeypatch.setenv("MONTHLY_REPORT_TOKEN", "giusto-e-lungo-abbastanza")
    assert (await client.post(URL)).status_code == 401
    assert (await client.post(URL, headers={"X-Report-Token": "sbagliato"})).status_code == 401


async def test_report_is_saved_and_emailed_once(client, app_db, monkeypatch):
    monkeypatch.setenv("MONTHLY_REPORT_TOKEN", "giusto-e-lungo-abbastanza")
    sent = []

    async def fake_send(subject, html, text, to):
        sent.append((subject, to))
        return True

    monkeypatch.setattr(mr, "send_email", fake_send)
    headers = {"X-Report-Token": "giusto-e-lungo-abbastanza"}

    first = await client.post(URL, json={"year": 2026, "month": 10}, headers=headers)
    second = await client.post(URL, json={"year": 2026, "month": 10}, headers=headers)

    assert first.status_code == 200 and first.json()["email_sent"] is True
    assert second.json()["email_sent"] is False  # un tentativo ripetuto non rimanda la stessa email
    assert len(sent) == 1
    saved = await app_db.monthly_reports.find_one({"period": "2026-10"})
    assert saved["utenti"]["nuovi_iscritti"] == 0


async def test_force_sends_again(client, app_db, monkeypatch):
    monkeypatch.setenv("MONTHLY_REPORT_TOKEN", "giusto-e-lungo-abbastanza")
    sent = []

    async def fake_send(subject, html, text, to):
        sent.append(1)
        return True

    monkeypatch.setattr(mr, "send_email", fake_send)
    headers = {"X-Report-Token": "giusto-e-lungo-abbastanza"}
    await client.post(URL, json={"year": 2026, "month": 10}, headers=headers)
    await client.post(URL, json={"year": 2026, "month": 10, "force": True}, headers=headers)
    assert len(sent) == 2


async def test_invalid_month_is_a_400(client, monkeypatch):
    monkeypatch.setenv("MONTHLY_REPORT_TOKEN", "giusto-e-lungo-abbastanza")
    response = await client.post(URL, json={"year": 2026, "month": 13}, headers={"X-Report-Token": "giusto-e-lungo-abbastanza"})
    assert response.status_code == 400


async def test_token_with_stray_spaces_or_newlines_still_matches(client, monkeypatch):
    """Copiando il codice su Render o GitHub può restare un a-capo o uno spazio: non deve impedire il rapporto."""
    monkeypatch.setenv("MONTHLY_REPORT_TOKEN", "giusto-e-lungo-abbastanza\n")
    monkeypatch.setattr(mr, "send_email", lambda *args: _true())

    response = await client.post(URL, json={"year": 2026, "month": 10}, headers={"X-Report-Token": "  giusto-e-lungo-abbastanza "})

    assert response.status_code == 200


async def _true():
    return True
