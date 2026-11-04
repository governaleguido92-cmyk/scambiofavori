"""Fiducia e sicurezza: livelli, limiti per i nuovi, coppie ripetute, reputazione, garanzie e allarme sicurezza."""
from datetime import datetime, timedelta, timezone

import trust
from conftest import auth, make_favor, make_user

FAVOR_BODY = {
    "type": "request",
    "title": "Aiuto con la spesa",
    "description": "Servono due buste portate a casa",
    "category": "Spesa",
    "duration_hours": 1.0,
}


def _active(favor_id: str, creator: str, **extra) -> dict:
    return make_favor(
        favor_id,
        creator_id=creator,
        creator_name=creator,
        status="active",
        accepted_by=None,
        accepted_by_name=None,
        approximate_latitude=37.9,
        approximate_longitude=12.3,
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
        **extra,
    )


# ---------- livelli di fiducia ----------

def test_new_user_is_level_one_when_sms_is_off(monkeypatch):
    monkeypatch.setattr(trust, "PHONE_VERIFICATION_REQUIRED", False)
    assert trust.trust_level(make_user("u")) == 1


def test_new_user_is_level_zero_without_phone_when_sms_is_required(monkeypatch):
    monkeypatch.setattr(trust, "PHONE_VERIFICATION_REQUIRED", True)
    assert trust.trust_level(make_user("u")) == 0
    assert trust.trust_level(make_user("u", phone_verified=True)) == 1


def test_level_two_needs_three_favors_and_good_rating(monkeypatch):
    monkeypatch.setattr(trust, "PHONE_VERIFICATION_REQUIRED", False)
    assert trust.trust_level(make_user("u", total_favors_given=2, total_favors_received=0)) == 1
    assert trust.trust_level(make_user("u", total_favors_given=2, total_favors_received=1)) == 2
    assert trust.trust_level(make_user("u", total_favors_given=5, average_rating=2.0)) == 1


def test_level_three_needs_identity_check(monkeypatch):
    monkeypatch.setattr(trust, "PHONE_VERIFICATION_REQUIRED", False)
    assert trust.trust_level(make_user("u", total_favors_given=5, identity_verified=True)) == 3
    assert trust.trust_level(make_user("u", identity_verified=True)) == 1


# ---------- limiti per i nuovi utenti ----------

async def test_new_user_cannot_create_expensive_favor(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    response = await client.post("/api/favors", json={**FAVOR_BODY, "duration_hours": 4.0}, headers=auth("me"))
    assert response.status_code == 403
    assert "nuovi" in response.json()["detail"].lower()


async def test_new_user_cannot_have_more_than_two_open_favors(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_many([_active("f1", "me"), _active("f2", "me")])
    response = await client.post("/api/favors", json=FAVOR_BODY, headers=auth("me"))
    assert response.status_code == 403


async def test_experienced_user_has_no_new_user_limits(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=20, total_favors_given=5))
    await app_db.favors.insert_many([_active("f1", "me"), _active("f2", "me"), _active("f3", "me")])
    response = await client.post("/api/favors", json={**FAVOR_BODY, "duration_hours": 4.0}, headers=auth("me"))
    assert response.status_code == 200, response.text


async def test_emergency_is_exempt_from_new_user_limits(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=20))
    await app_db.favors.insert_many([_active("f1", "me"), _active("f2", "me")])
    response = await client.post(
        "/api/favors", json={**FAVOR_BODY, "duration_hours": 4.0, "is_emergency": True}, headers=auth("me")
    )
    assert response.status_code == 200, response.text


async def test_new_user_cannot_accept_third_open_favor(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("other")])
    await app_db.favors.insert_many([
        make_favor("a1", creator_id="other", creator_name="other", accepted_by="me", status="accepted"),
        make_favor("a2", creator_id="other", creator_name="other", accepted_by="me", status="accepted"),
        _active("target", "other"),
    ])
    response = await client.post("/api/favors/accept", json={"favor_id": "target"}, headers=auth("me"))
    assert response.status_code == 403


# ---------- coppie ripetute ----------

async def test_same_pair_cannot_exchange_more_than_two_favors_a_week(client, app_db):
    await app_db.users.insert_many([
        make_user("me", total_favors_given=5), make_user("friend", total_favors_given=5)
    ])
    now = datetime.now(timezone.utc)
    await app_db.favors.insert_many([
        make_favor("d1", creator_id="friend", creator_name="friend", accepted_by="me", status="completed", completed_at=now),
        make_favor("d2", creator_id="me", creator_name="me", accepted_by="friend", status="completed", completed_at=now),
        _active("target", "friend"),
    ])
    response = await client.post("/api/favors/accept", json={"favor_id": "target"}, headers=auth("me"))
    assert response.status_code == 403
    assert "stessa persona" in response.json()["detail"].lower()


async def test_old_exchanges_do_not_count_for_pair_limit(app_db):
    old = datetime.now(timezone.utc) - timedelta(days=10)
    await app_db.favors.insert_many([
        make_favor("d1", creator_id="friend", creator_name="friend", accepted_by="me", status="completed", completed_at=old),
        make_favor("d2", creator_id="friend", creator_name="friend", accepted_by="me", status="completed", completed_at=old),
    ])
    await trust.ensure_pair_not_overused("me", "friend")  # non solleva


# ---------- sollecito di conferma ----------

async def test_helper_can_remind_payer_once_a_day(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    first = await client.post("/api/favors/favor_1/remind-confirmation", headers=auth("helper"))
    second = await client.post("/api/favors/favor_1/remind-confirmation", headers=auth("helper"))

    assert first.status_code == 200
    assert second.status_code == 429
    assert await app_db.notifications.count_documents({"user_id": "creator", "type": "confirmation_reminder"}) == 1


async def test_payer_cannot_remind_himself(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())
    response = await client.post("/api/favors/favor_1/remind-confirmation", headers=auth("creator"))
    assert response.status_code == 403


# ---------- reputazione ----------

async def test_cancel_after_acceptance_is_counted(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.delete("/api/favors/favor_1", headers=auth("creator"))

    assert response.status_code == 200, response.text
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["cancelled_by"] == "creator"
    assert stored["cancelled_after_accept"] is True


async def test_reputation_reports_completed_and_cancel_rate(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("viewer")])
    await app_db.favors.insert_many([
        make_favor("c1", creator_id="me", creator_name="me", status="completed"),
        make_favor("c2", creator_id="x", creator_name="x", accepted_by="me", status="completed"),
        make_favor("k1", creator_id="me", creator_name="me", status="cancelled",
                   cancelled_by="me", cancelled_after_accept=True),
    ])
    response = await client.get("/api/users/me/reputation", headers=auth("viewer"))
    # "me" è un percorso fisso del profilo personale: la reputazione di un altro utente passa dall'id
    assert response.status_code in (200, 404)

    response = await client.get("/api/users/me/reputation", headers=auth("me"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["completed"] == 2
    assert body["late_cancellations"] == 1
    assert body["cancel_rate"] == 0.33


# ---------- garanzie ----------

async def test_level_two_user_can_vouch_for_another(client, app_db):
    await app_db.users.insert_many([make_user("voucher", total_favors_given=5), make_user("friend")])
    response = await client.post("/api/users/friend/vouch", headers=auth("voucher"))
    assert response.status_code == 200, response.text
    assert await app_db.vouches.count_documents({"voucher_id": "voucher", "vouchee_id": "friend"}) == 1


async def test_new_user_cannot_vouch(client, app_db):
    await app_db.users.insert_many([make_user("newbie"), make_user("friend")])
    response = await client.post("/api/users/friend/vouch", headers=auth("newbie"))
    assert response.status_code == 403


async def test_cannot_vouch_twice_or_for_self(client, app_db):
    await app_db.users.insert_many([make_user("voucher", total_favors_given=5), make_user("friend")])
    assert (await client.post("/api/users/voucher/vouch", headers=auth("voucher"))).status_code == 400
    assert (await client.post("/api/users/friend/vouch", headers=auth("voucher"))).status_code == 200
    assert (await client.post("/api/users/friend/vouch", headers=auth("voucher"))).status_code == 400


async def test_vouch_limit_is_three_per_month(client, app_db):
    await app_db.users.insert_many(
        [make_user("voucher", total_favors_given=5)] + [make_user(f"f{i}") for i in range(4)]
    )
    codes = [(await client.post(f"/api/users/f{i}/vouch", headers=auth("voucher"))).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]


async def test_public_profile_shows_vouch_count_and_trust_level(client, app_db):
    await app_db.users.insert_many([make_user("voucher", total_favors_given=5), make_user("friend"), make_user("viewer")])
    await client.post("/api/users/friend/vouch", headers=auth("voucher"))
    response = await client.get("/api/users/friend/public", headers=auth("viewer"))
    body = response.json()
    assert body["vouch_count"] == 1
    assert body["trust_level"] == 1


# ---------- allarme sicurezza ----------

async def test_safety_alert_cancels_blocks_and_reports(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post("/api/favors/favor_1/safety-alert", json={}, headers=auth("helper"))

    assert response.status_code == 200, response.text
    assert response.json()["emergency_number"] == "112"
    favor = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert favor["status"] == "cancelled"
    assert favor["safety_alert"] is True
    assert await app_db.blocked_users.count_documents({"blocker_id": "helper", "blocked_id": "creator"}) == 1
    report = await app_db.general_reports.find_one({"reason": "safety_alert"})
    assert report["target_id"] == "creator"
    assert report["priority"] == "high"


async def test_safety_alert_only_for_participants(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper"), make_user("stranger")])
    await app_db.favors.insert_one(make_favor())
    response = await client.post("/api/favors/favor_1/safety-alert", json={}, headers=auth("stranger"))
    assert response.status_code == 403


async def test_two_alerts_from_different_users_put_account_on_hold(client, app_db):
    await app_db.users.insert_many([make_user("bad"), make_user("a"), make_user("b")])
    await app_db.favors.insert_many([
        make_favor("s1", creator_id="bad", creator_name="bad", accepted_by="a", status="accepted"),
        make_favor("s2", creator_id="bad", creator_name="bad", accepted_by="b", status="accepted"),
    ])
    await client.post("/api/favors/s1/safety-alert", json={}, headers=auth("a"))
    assert (await app_db.users.find_one({"user_id": "bad"})).get("safety_hold") is not True
    await client.post("/api/favors/s2/safety-alert", json={}, headers=auth("b"))
    assert (await app_db.users.find_one({"user_id": "bad"}))["safety_hold"] is True


async def test_account_on_hold_cannot_create_or_message(client, app_db):
    await app_db.users.insert_many([make_user("bad", safety_hold=True, total_favors_given=5), make_user("other")])
    await app_db.favors.insert_one(make_favor(creator_id="other", creator_name="other", accepted_by="bad"))

    create = await client.post("/api/favors", json=FAVOR_BODY, headers=auth("bad"))
    message = await client.post(
        "/api/messages", json={"favor_id": "favor_1", "content": "Ciao, arrivo domani"}, headers=auth("bad")
    )

    assert create.status_code == 403
    assert message.status_code == 403


async def test_hold_penalizes_those_who_vouched(client, app_db):
    await app_db.users.insert_many([make_user("bad"), make_user("a"), make_user("b"), make_user("voucher")])
    await app_db.vouches.insert_one({
        "voucher_id": "voucher", "vouchee_id": "bad", "created_at": datetime.now(timezone.utc)
    })
    await app_db.favors.insert_many([
        make_favor("s1", creator_id="bad", creator_name="bad", accepted_by="a", status="accepted"),
        make_favor("s2", creator_id="bad", creator_name="bad", accepted_by="b", status="accepted"),
    ])
    await client.post("/api/favors/s1/safety-alert", json={}, headers=auth("a"))
    await client.post("/api/favors/s2/safety-alert", json={}, headers=auth("b"))
    assert (await app_db.users.find_one({"user_id": "voucher"}))["vouch_penalties"] == 1


# ---------- stato di fiducia personale ----------

async def test_my_trust_endpoint_shows_level_and_limits(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    response = await client.get("/api/users/me/trust", headers=auth("me"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["trust_level"] == 1
    assert body["is_new_user"] is True
    assert body["favors_to_next_level"] == 3
    assert body["max_open_favors"] == 2
