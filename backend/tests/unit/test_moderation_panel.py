"""Pannello di moderazione: segnalazioni da leggere e gestire, protetto da un codice solo del titolare."""
from datetime import datetime, timedelta, timezone

import pytest

import moderation_notify
from conftest import auth, make_favor, make_user

BASE = "/api/admin/moderation"
TOKEN = "codice-moderazione-molto-lungo-123"
HEADERS = {"X-Moderation-Token": TOKEN}
NOW = datetime.now(timezone.utc)


@pytest.fixture(autouse=True)
def moderation_token(monkeypatch):
    monkeypatch.setenv("MODERATION_TOKEN", TOKEN)
    moderation_notify._last_sent.clear()  # ogni prova parte senza avvisi già inviati


@pytest.fixture
def emails(monkeypatch):
    sent = []

    async def fake_send(subject, html, text, to):
        sent.append({"subject": subject, "text": text, "to": to})
        return True

    monkeypatch.setattr(moderation_notify.monthly_report, "send_email", fake_send)
    return sent


def report(report_id, report_type, target_id, reporter="ann", reason="offensive", **extra):
    return {"report_id": report_id, "reporter_id": reporter, "report_type": report_type, "target_id": target_id,
            "reason": reason, "status": "pending", "created_at": NOW, **extra}


async def seed(app_db):
    await app_db.users.insert_many([make_user("ann"), make_user("bad", name="Bad Guy", phone="3331112222"), make_user("luca")])
    await app_db.users.update_one({"user_id": "ann"}, {"$set": {"name": "Ann"}})
    await app_db.favors.insert_one(make_favor("fav1", creator_id="bad", creator_name="Bad Guy", title="Favore sospetto", status="active", accepted_by=None))
    await app_db.area_messages.insert_one({"message_id": "am1", "author_id": "bad", "author_name": "Bad Guy", "content": "Testo offensivo",
                                           "hidden": False, "created_at": NOW})
    await app_db.neighborhood_notices.insert_one({"notice_id": "n1", "author_id": "bad", "author_name": "Bad Guy", "category": "altro",
                                                  "text": "Avviso strano", "hidden": False, "created_at": NOW})
    await app_db.neighborhood_events.insert_one({"event_id": "e1", "author_id": "bad", "author_name": "Bad Guy", "kind": "evento",
                                                 "title": "Evento strano", "place": "Piazza", "hidden": False, "starts_at": NOW + timedelta(days=1)})
    await app_db.neighborhood_intros.insert_one({"intro_id": "i1", "author_id": "bad", "author_name": "Bad Guy", "text": "Presentazione strana",
                                                 "hidden": False, "created_at": NOW})
    await app_db.general_reports.insert_many([
        report("r_user", "user", "bad", reason="fraud", created_at=NOW - timedelta(hours=5)),
        report("r_fav", "favor", "fav1", created_at=NOW - timedelta(hours=4)),
        report("r_area", "area_message", "am1", created_at=NOW - timedelta(hours=3)),
        report("r_notice", "neighborhood_notice", "n1", created_at=NOW - timedelta(hours=2)),
        report("r_event", "neighborhood_event", "e1", created_at=NOW - timedelta(hours=1)),
        report("r_intro", "neighborhood_intro", "i1"),
        report("r_alert", "user", "bad", reason="safety_alert", priority="high", favor_id="fav1", created_at=NOW - timedelta(hours=6)),
    ])
    await app_db.reports.insert_one({"report_id": "r_chat", "favor_id": "fav1", "reporter_id": "luca", "reported_user_id": "bad",
                                     "reason": "money_request", "description": "Chiede soldi", "status": "pending", "created_at": NOW})


async def list_reports(client, **params):
    response = await client.get(f"{BASE}/reports", params=params, headers=HEADERS)
    assert response.status_code == 200, response.text
    return response.json()["reports"]


# ---------- accesso ----------

async def test_panel_is_off_without_a_token(client, monkeypatch):
    monkeypatch.delenv("MODERATION_TOKEN", raising=False)
    assert (await client.get(f"{BASE}/reports", headers=HEADERS)).status_code == 503


async def test_panel_is_off_with_a_weak_token(client, monkeypatch):
    monkeypatch.setenv("MODERATION_TOKEN", "corto")
    assert (await client.get(f"{BASE}/reports", headers={"X-Moderation-Token": "corto"})).status_code == 503


@pytest.mark.parametrize("headers", [{}, {"X-Moderation-Token": "sbagliato"}, {"X-Moderation-Token": TOKEN + "x"}])
async def test_wrong_or_missing_token_is_refused(client, headers):
    assert (await client.get(f"{BASE}/reports", headers=headers)).status_code == 401
    assert (await client.get(f"{BASE}/held-users", headers=headers)).status_code == 401
    assert (await client.post(f"{BASE}/reports/x/action", json={"action": "dismiss"}, headers=headers)).status_code == 401


async def test_a_normal_user_token_is_not_enough(client, app_db):
    await app_db.users.insert_one(make_user("ann"))
    assert (await client.get(f"{BASE}/reports", headers=auth("ann"))).status_code == 403


async def test_token_with_stray_spaces_still_works(client, app_db):
    response = await client.get(f"{BASE}/reports", headers={"X-Moderation-Token": f"  {TOKEN}\n"})
    assert response.status_code == 200


async def test_panel_page_has_no_data_and_strict_headers(client):
    response = await client.get(f"{BASE}/panel")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "noindex" in response.headers["x-robots-tag"]
    assert "no-store" in response.headers["cache-control"]
    assert TOKEN not in response.text


# ---------- elenco ----------

async def test_reports_list_covers_every_kind_with_context(client, app_db):
    await seed(app_db)
    items = {r["report_id"]: r for r in await list_reports(client)}
    assert set(items) == {"r_user", "r_fav", "r_area", "r_notice", "r_event", "r_intro", "r_alert", "r_chat"}

    assert items["r_area"]["target"]["summary"] == "Testo offensivo" and items["r_area"]["target"]["kind"] == "Messaggio del quartiere"
    assert items["r_notice"]["target"]["summary"] == "Avviso strano"
    assert items["r_event"]["target"]["summary"] == "Evento strano"
    assert items["r_intro"]["target"]["summary"] == "Presentazione strana"
    assert items["r_fav"]["target"]["summary"] == "Favore sospetto"
    assert items["r_chat"]["description"] == "Chiede soldi" and items["r_chat"]["reported_user"]["user_id"] == "bad"
    assert items["r_user"]["reporter_name"] == "Ann" and items["r_user"]["reported_user"]["name"] == "Bad Guy"


async def test_list_never_exposes_contact_data(client, app_db):
    await seed(app_db)
    raw = (await client.get(f"{BASE}/reports", headers=HEADERS)).text
    assert "3331112222" not in raw and "@example.com" not in raw


async def test_alerts_come_first_then_newest(client, app_db):
    await seed(app_db)
    ids = [r["report_id"] for r in await list_reports(client)]
    assert ids[0] == "r_alert"
    assert set(ids[1:3]) == {"r_chat", "r_intro"}  # i più recenti dopo gli allarmi


async def test_times_reported_counts_all_reports_on_the_same_person(client, app_db):
    await seed(app_db)
    items = {r["report_id"]: r for r in await list_reports(client)}
    assert items["r_area"]["reported_user"]["reports_total"] == 8


async def test_default_is_pending_only_and_all_shows_resolved(client, app_db):
    await seed(app_db)
    await app_db.general_reports.update_one({"report_id": "r_user"}, {"$set": {"status": "dismissed"}})
    assert "r_user" not in {r["report_id"] for r in await list_reports(client)}
    assert "r_user" in {r["report_id"] for r in await list_reports(client, status="all")}


async def test_report_on_a_deleted_target_still_lists(client, app_db):
    await app_db.users.insert_one(make_user("ann"))
    await app_db.general_reports.insert_one(report("r_gone", "area_message", "sparito"))
    item = (await list_reports(client))[0]
    assert item["target"]["summary"] == "(contenuto non più disponibile)"


# ---------- azioni ----------

async def act(client, report_id, action, note=None):
    return await client.post(f"{BASE}/reports/{report_id}/action", json={"action": action, "note": note}, headers=HEADERS)


async def test_dismiss_marks_the_report_and_logs_it(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_area", "dismiss", "Tutto ok")).status_code == 200
    stored = await app_db.general_reports.find_one({"report_id": "r_area"})
    assert stored["status"] == "dismissed" and stored["resolution_note"] == "Tutto ok"
    log = await app_db.moderation_actions.find_one({"report_id": "r_area"})
    assert log["action"] == "dismiss" and log["target_id"] == "am1"


@pytest.mark.parametrize("report_id,collection,key,field,expected", [
    ("r_area", "area_messages", "message_id", "hidden", True),
    ("r_notice", "neighborhood_notices", "notice_id", "hidden", True),
    ("r_event", "neighborhood_events", "event_id", "hidden", True),
    ("r_intro", "neighborhood_intros", "intro_id", "hidden", True),
])
async def test_hide_content_hides_the_target(client, app_db, report_id, collection, key, field, expected):
    await seed(app_db)
    target_id = (await app_db.general_reports.find_one({"report_id": report_id}))["target_id"]
    assert (await act(client, report_id, "hide_content")).status_code == 200
    assert (await app_db[collection].find_one({key: target_id}))[field] is expected
    assert (await app_db.general_reports.find_one({"report_id": report_id}))["status"] == "resolved"


async def test_hide_content_on_a_favor_report(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_fav", "hide_content")).status_code == 200
    assert (await app_db.favors.find_one({"favor_id": "fav1"}))["status"] == "hidden_reported"


async def test_hide_content_is_refused_for_user_reports(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_user", "hide_content")).status_code == 400


async def test_hold_and_release_user(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_alert", "hold_user", "Allarme confermato")).status_code == 200
    assert (await app_db.users.find_one({"user_id": "bad"}))["safety_hold"] is True
    held = (await client.get(f"{BASE}/held-users", headers=HEADERS)).json()["users"]
    assert [u["user_id"] for u in held] == ["bad"] and held[0]["name"] == "Bad Guy" and "email" not in held[0]

    assert (await act(client, "r_user", "release_user")).status_code == 200
    user = await app_db.users.find_one({"user_id": "bad"})
    assert not user.get("safety_hold") and not user.get("shadow_banned") and not user.get("banned_from_chat")
    assert (await client.get(f"{BASE}/held-users", headers=HEADERS)).json()["users"] == []


async def test_chat_report_status_is_updated_in_its_own_collection(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_chat", "hold_user")).status_code == 200
    assert (await app_db.reports.find_one({"report_id": "r_chat"}))["status"] == "confirmed"
    assert (await act(client, "r_chat", "dismiss")).status_code == 409


async def test_unknown_action_unknown_report_and_double_action(client, app_db):
    await seed(app_db)
    assert (await act(client, "r_area", "cancella_tutto")).status_code == 400
    assert (await act(client, "non_esiste", "dismiss")).status_code == 404
    assert (await act(client, "r_area", "dismiss")).status_code == 200
    assert (await act(client, "r_area", "dismiss")).status_code == 409


async def test_held_account_cannot_publish_in_the_neighborhood(client, app_db):
    await app_db.users.insert_one(make_user("bad", safety_hold=True))
    await app_db.favors.insert_one(make_favor("f1", creator_id="bad", creator_name="bad", status="active", accepted_by=None,
                                              approximate_latitude=37.93, approximate_longitude=12.33,
                                              expires_at=NOW + timedelta(days=3)))
    response = await client.post("/api/neighborhood/notices", json={"category": "altro", "text": "Ciao a tutti"}, headers=auth("bad"))
    assert response.status_code == 403


# ---------- notifiche per email ----------

async def test_safety_alert_emails_the_owner(client, app_db, emails):
    await app_db.users.insert_many([make_user("ann"), make_user("bad")])
    await app_db.favors.insert_one(make_favor("fav1", creator_id="ann", creator_name="ann", accepted_by="bad", status="accepted"))
    response = await client.post("/api/favors/fav1/safety-alert", json={"description": "Mi ha messo a disagio"}, headers=auth("ann"))
    assert response.status_code == 200, response.text
    assert len(emails) == 1
    assert "sicurezza" in emails[0]["subject"].lower()
    assert "bad" in emails[0]["text"] and "panel" in emails[0]["text"].lower()


async def test_second_alert_reports_that_the_account_went_on_hold(client, app_db, emails):
    await app_db.users.insert_many([make_user("a"), make_user("b"), make_user("bad")])
    await app_db.favors.insert_many([
        make_favor("f1", creator_id="a", creator_name="a", accepted_by="bad", status="accepted"),
        make_favor("f2", creator_id="b", creator_name="b", accepted_by="bad", status="accepted"),
    ])
    await client.post("/api/favors/f1/safety-alert", json={}, headers=auth("a"))
    await client.post("/api/favors/f2/safety-alert", json={}, headers=auth("b"))
    assert len(emails) == 2
    assert "revisione" in emails[1]["subject"].lower()


async def test_content_hidden_by_three_reports_emails_the_owner(client, app_db, emails):
    from datetime import timezone as tz
    for name in ("author", "a", "b", "c"):
        await app_db.users.insert_one(make_user(name, email_verified=True, approximate_latitude=37.93, approximate_longitude=12.33))
        await app_db.favors.insert_one(make_favor(f"f_{name}", creator_id=name, creator_name=name, status="active", accepted_by=None,
                                                  approximate_latitude=37.93, approximate_longitude=12.33,
                                                  expires_at=NOW + timedelta(days=3)))
    notice_id = (await client.post("/api/neighborhood/notices", json={"category": "altro", "text": "Avviso da segnalare"}, headers=auth("author"))).json()["notice_id"]
    for name in ("a", "b", "c"):
        await client.post(f"/api/neighborhood/notices/{notice_id}/report", json={}, headers=auth(name))
    assert len(emails) == 1 and "nascosto" in emails[0]["subject"].lower()


async def test_email_failure_never_breaks_the_request(client, app_db, monkeypatch):
    async def boom(subject, html, text, to):
        raise RuntimeError("email giù")

    monkeypatch.setattr(moderation_notify.monthly_report, "send_email", boom)
    await app_db.users.insert_many([make_user("ann"), make_user("bad")])
    await app_db.favors.insert_one(make_favor("fav1", creator_id="ann", creator_name="ann", accepted_by="bad", status="accepted"))
    assert (await client.post("/api/favors/fav1/safety-alert", json={}, headers=auth("ann"))).status_code == 200


# ---------- accesso dei moderatori con il loro account ----------

@pytest.fixture
def moderators(monkeypatch):
    monkeypatch.setenv("MODERATOR_EMAILS", " Guido@Example.com , altra@example.com ")


async def moderator(app_db, user_id="guido", email="guido@example.com", **extra):
    await app_db.users.insert_one(make_user(user_id, email=email, email_verified=True, **extra))
    return auth(user_id)


async def test_verified_moderator_can_read_reports_with_the_session(client, app_db, moderators):
    headers = await moderator(app_db)
    await seed(app_db)
    response = await client.get(f"{BASE}/reports", headers=headers)
    assert response.status_code == 200 and len(response.json()["reports"]) == 8


async def test_moderator_email_match_ignores_case_and_spaces(client, app_db, moderators):
    headers = await moderator(app_db, "altra", "ALTRA@example.com")
    assert (await client.get(f"{BASE}/held-users", headers=headers)).status_code == 200


async def test_normal_user_is_not_enabled(client, app_db, moderators):
    await app_db.users.insert_one(make_user("ann", email_verified=True))
    assert (await client.get(f"{BASE}/reports", headers=auth("ann"))).status_code == 403


async def test_unverified_email_never_gets_the_role(client, app_db, moderators):
    await app_db.users.insert_one(make_user("guido", email="guido@example.com", email_verified=False))
    assert (await client.get(f"{BASE}/reports", headers=auth("guido"))).status_code == 403


async def test_no_moderators_configured_means_nobody(client, app_db, monkeypatch):
    monkeypatch.delenv("MODERATOR_EMAILS", raising=False)
    headers = await moderator(app_db)
    assert (await client.get(f"{BASE}/reports", headers=headers)).status_code == 403


async def test_me_tells_if_the_account_is_a_moderator(client, app_db, moderators):
    headers = await moderator(app_db)
    await app_db.users.insert_one(make_user("ann", email_verified=True))
    assert (await client.get(f"{BASE}/me", headers=headers)).json() == {"moderator": True}
    assert (await client.get(f"{BASE}/me", headers=auth("ann"))).json() == {"moderator": False}
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_actions_by_a_moderator_are_logged_with_who_did_them(client, app_db, moderators):
    headers = await moderator(app_db)
    await seed(app_db)
    response = await client.post(f"{BASE}/reports/r_area/action", json={"action": "dismiss"}, headers=headers)
    assert response.status_code == 200
    assert (await app_db.moderation_actions.find_one({"report_id": "r_area"}))["by"] == "guido"


async def test_google_login_verifies_the_email(client, app_db, monkeypatch):
    import httpx

    class FakeResp:
        status_code = 200

        def json(self):
            return {"email": "nuovo@example.com", "name": "Nuovo", "picture": None, "session_token": "tok1"}

    async def fake_get(self, *a, **k):
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    assert (await client.post("/api/auth/session", json={"session_id": "x"})).status_code == 200
    assert (await app_db.users.find_one({"email": "nuovo@example.com"}))["email_verified"] is True


async def test_google_login_removes_a_password_planted_on_a_moderator_email(client, app_db, moderators, monkeypatch):
    """Chi si è registrato con l'email del moderatore prima di lui non deve restare con una password valida."""
    import httpx

    await app_db.users.insert_one(make_user("guido", email="guido@example.com", email_verified=False, password_hash="hash-di-un-estraneo"))

    class FakeResp:
        status_code = 200

        def json(self):
            return {"email": "guido@example.com", "name": "Guido", "picture": None, "session_token": "tok2"}

    async def fake_get(self, *a, **k):
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    assert (await client.post("/api/auth/session", json={"session_id": "x"})).status_code == 200
    stored = await app_db.users.find_one({"user_id": "guido"})
    assert stored["email_verified"] is True and "password_hash" not in stored


async def test_google_login_keeps_passwords_of_normal_users(client, app_db, moderators, monkeypatch):
    import httpx

    await app_db.users.insert_one(make_user("ann", email="ann@example.com", email_verified=False, password_hash="hash-di-ann"))

    class FakeResp:
        status_code = 200

        def json(self):
            return {"email": "ann@example.com", "name": "Ann", "picture": None, "session_token": "tok3"}

    async def fake_get(self, *a, **k):
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    await client.post("/api/auth/session", json={"session_id": "x"})
    assert (await app_db.users.find_one({"user_id": "ann"}))["password_hash"] == "hash-di-ann"
