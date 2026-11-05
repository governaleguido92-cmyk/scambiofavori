"""Correzioni dal controllo di sicurezza: sessioni di chi si registra con l'email di un moderatore, segnalazioni di account veri,
avvisi email senza raffiche, testi puliti."""
from datetime import datetime, timedelta, timezone

import pytest

import core
import moderation_notify
from conftest import auth, google_login, make_favor, make_user

BASE = "/api/admin/moderation"
NOW = datetime.now(timezone.utc)


@pytest.fixture
def moderators(monkeypatch):
    monkeypatch.setenv("MODERATOR_EMAILS", "guido@example.com")


# ---------- HIGH: la sessione dell'impostore non sopravvive all'accesso con Google del vero moderatore ----------

async def test_attacker_session_dies_when_the_real_moderator_signs_in_with_google(client, app_db, moderators, monkeypatch):
    await app_db.users.insert_one(make_user("guido", email="guido@example.com", email_verified=False, password_hash="hash-impostore"))
    attacker_jwt = {"Authorization": f"Bearer {core.create_jwt_token('guido')}"}
    assert (await client.get(f"{BASE}/me", headers=attacker_jwt)).status_code == 200  # prima vale

    login = await google_login(client, monkeypatch, "guido@example.com")
    assert login.status_code == 200
    client.cookies.clear()  # il cookie del vero moderatore non deve aiutare l'impostore

    assert (await client.get(f"{BASE}/me", headers=attacker_jwt)).status_code == 401
    assert (await client.get(f"{BASE}/reports", headers=attacker_jwt)).status_code == 401
    real = {"Authorization": f"Bearer {login.json()['token']}"}
    assert (await client.get(f"{BASE}/me", headers=real)).json() == {"moderator": True}


async def test_sessions_of_verified_users_survive_google_login(client, app_db, moderators, monkeypatch):
    await app_db.users.insert_one(make_user("ann", email="ann@example.com", email_verified=True, password_hash="hash-ann"))
    ann_jwt = {"Authorization": f"Bearer {core.create_jwt_token('ann')}"}
    await google_login(client, monkeypatch, "ann@example.com", "Ann")
    client.cookies.clear()
    assert (await client.get(f"{BASE}/me", headers=ann_jwt)).status_code == 200


async def test_unverified_account_loses_password_and_sessions_on_google_login(client, app_db, moderators, monkeypatch):
    """Chi si registra con l'email di un altro senza verificarla non resta dentro quando il vero proprietario entra con Google."""
    await app_db.users.insert_one(make_user("bob", email="bob@example.com", email_verified=False, password_hash="hash-impostore"))
    attacker_jwt = {"Authorization": f"Bearer {core.create_jwt_token('bob')}"}
    await google_login(client, monkeypatch, "bob@example.com", "Bob")
    client.cookies.clear()
    assert (await client.get(f"{BASE}/me", headers=attacker_jwt)).status_code == 401
    assert "password_hash" not in await app_db.users.find_one({"user_id": "bob"})


# ---------- MEDIO: solo account veri fanno nascondere i contenuti ----------

async def open_favor_for(app_db, name):
    await app_db.favors.insert_one(make_favor(f"f_{name}", creator_id=name, creator_name=name, status="active", accepted_by=None,
                                              approximate_latitude=37.93, approximate_longitude=12.33,
                                              expires_at=NOW + timedelta(days=3)))


async def notice_by(client, app_db, author="author"):
    await app_db.users.insert_one(make_user(author, approximate_latitude=37.93, approximate_longitude=12.33))
    await open_favor_for(app_db, author)
    return (await client.post("/api/neighborhood/notices", json={"category": "altro", "text": "Avviso da segnalare"}, headers=auth(author))).json()["notice_id"]


async def reporters(app_db, count, verified):
    names = [f"r{i}" for i in range(count)]
    for name in names:
        extra = {"email_verified": True} if verified else {}
        await app_db.users.insert_one(make_user(name, approximate_latitude=37.93, approximate_longitude=12.33, **extra))
        await open_favor_for(app_db, name)
    return names


async def test_three_unverified_accounts_cannot_hide_a_notice(client, app_db):
    notice_id = await notice_by(client, app_db)
    for name in await reporters(app_db, 3, verified=False):
        assert (await client.post(f"/api/neighborhood/notices/{notice_id}/report", json={}, headers=auth(name))).status_code == 200
    assert (await app_db.neighborhood_notices.find_one({"notice_id": notice_id}))["hidden"] is False


async def test_three_verified_accounts_hide_a_notice(client, app_db):
    notice_id = await notice_by(client, app_db)
    for name in await reporters(app_db, 3, verified=True):
        await client.post(f"/api/neighborhood/notices/{notice_id}/report", json={}, headers=auth(name))
    assert (await app_db.neighborhood_notices.find_one({"notice_id": notice_id}))["hidden"] is True


async def test_phone_verified_accounts_count_too(client, app_db):
    notice_id = await notice_by(client, app_db)
    for i in range(3):
        await app_db.users.insert_one(make_user(f"p{i}", phone_verified=True, approximate_latitude=37.93, approximate_longitude=12.33))
        await client.post(f"/api/neighborhood/notices/{notice_id}/report", json={}, headers=auth(f"p{i}"))
    assert (await app_db.neighborhood_notices.find_one({"notice_id": notice_id}))["hidden"] is True


# ---------- MEDIO: niente raffiche di email al titolare ----------

@pytest.fixture
def emails(monkeypatch):
    sent = []

    async def fake_send(subject, html, text, to):
        sent.append({"subject": subject, "html": html, "text": text})
        return True

    monkeypatch.setattr(moderation_notify.monthly_report, "send_email", fake_send)
    moderation_notify._last_sent.clear()
    return sent


async def test_same_alert_key_is_emailed_once_an_hour(emails):
    assert await moderation_notify.notify_owner("Allarme", ["uno"], key="alert:bad") is True
    assert await moderation_notify.notify_owner("Allarme", ["due"], key="alert:bad") is False
    assert await moderation_notify.notify_owner("Allarme", ["tre"], key="alert:altro") is True
    assert len(emails) == 2
    moderation_notify._last_sent["alert:bad"] -= timedelta(hours=2)
    assert await moderation_notify.notify_owner("Allarme", ["quattro"], key="alert:bad") is True


async def test_email_text_is_cleaned_of_newlines_and_links(emails):
    await moderation_notify.notify_owner("Allarme", ["Mi scrive\nBCC: x@y.it\nvisita https://truffa.example/login ora"], key="k1")
    text = emails[0]["text"]
    assert "\nBCC" not in text and "https://truffa.example" not in text


# ---------- BASSO ----------

async def test_names_are_escaped_in_the_verification_email(monkeypatch):
    captured = {}
    monkeypatch.setattr(core, "RESEND_API_KEY", "chiave-finta")
    monkeypatch.setattr(core.resend.Emails, "send", lambda params: captured.update(params) or {"id": "1"})
    await core.send_verification_email("a@b.it", "123456", "<script>alert(1)</script>")
    assert "<script>" not in captured["html"] and "&lt;script&gt;" in captured["html"]


async def test_hide_content_on_a_favor_only_when_it_is_still_open(client, app_db, monkeypatch):
    monkeypatch.setenv("MODERATION_TOKEN", "codice-moderazione-molto-lungo-123")
    await app_db.users.insert_many([make_user("ann"), make_user("bad")])
    await app_db.favors.insert_one(make_favor("fav1", creator_id="bad", creator_name="bad", status="completed"))
    await app_db.general_reports.insert_one({"report_id": "r1", "reporter_id": "ann", "report_type": "favor", "target_id": "fav1",
                                             "reason": "other", "status": "pending", "created_at": NOW})
    response = await client.post(f"{BASE}/reports/r1/action", json={"action": "hide_content"},
                                 headers={"X-Moderation-Token": "codice-moderazione-molto-lungo-123"})
    assert response.status_code == 400
    assert (await app_db.favors.find_one({"favor_id": "fav1"}))["status"] == "completed"
