"""Verifica del telefono con codice via SMS, richiesta prima del primo favore."""
from datetime import datetime, timedelta, timezone

import pytest

import core
import sms
from conftest import auth, make_favor, make_user

PHONE = "+393450640166"


@pytest.fixture
def sent(monkeypatch):
    """Cattura gli SMS inviati invece di mandarli davvero."""
    messages: list[tuple[str, str]] = []

    async def fake_send(to: str, body: str) -> bool:
        messages.append((to, body))
        return True

    monkeypatch.setattr(sms, "send_sms", fake_send)
    return messages


def _code(messages: list[tuple[str, str]]) -> str:
    return next(token for token in messages[-1][1].split() if token.isdigit() and len(token) == 6)


async def _request(client, user: str = "me", phone: str = PHONE):
    return await client.post("/api/auth/phone/request", json={"phone": phone}, headers=auth(user))


# ---------- numeri di telefono ----------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("345 064 0166", "+393450640166"),
        ("3450640166", "+393450640166"),
        ("+39 345 064 0166", "+393450640166"),
        ("0039 345 064 0166", "+393450640166"),
        ("+1 (415) 555-2671", "+14155552671"),
        ("+34 612 345 678", "+34612345678"),
    ],
)
def test_normalize_phone(raw, expected):
    assert sms.normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "123", "+0 123 456 789", "+39", "34506401661234567890"])
def test_invalid_numbers_are_rejected(raw):
    assert sms.normalize_phone(raw) is None


# ---------- richiesta del codice ----------

async def test_request_sends_a_six_digit_code_by_sms(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))

    response = await _request(client)

    assert response.status_code == 200
    assert sent[-1][0] == PHONE
    assert len(_code(sent)) == 6


async def test_code_is_not_stored_in_clear(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    stored = await app_db.users.find_one({"user_id": "me"})

    assert _code(sent) not in str(stored)
    assert PHONE not in str(stored)


async def test_invalid_phone_is_a_400(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))

    response = await _request(client, phone="123")

    assert response.status_code == 400
    assert sent == []


async def test_request_requires_login(client, app_db):
    response = await client.post("/api/auth/phone/request", json={"phone": PHONE})

    assert response.status_code == 401


async def test_second_request_within_a_minute_is_refused(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await _request(client)

    assert response.status_code == 429
    assert len(sent) == 1


async def test_a_new_code_is_allowed_after_the_wait(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)
    await app_db.phone_requests.update_many({}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(minutes=2)}})

    response = await _request(client)

    assert response.status_code == 200
    assert len(sent) == 2


async def test_hourly_limit_on_requests(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    now = datetime.now(timezone.utc)
    await app_db.phone_requests.insert_many(
        [{"user_id": "me", "created_at": now - timedelta(minutes=5 + i)} for i in range(core.PHONE_MAX_REQUESTS_PER_HOUR)]
    )

    response = await _request(client)

    assert response.status_code == 429
    assert sent == []


async def test_phone_used_by_another_account_is_refused(client, app_db, sent):
    await app_db.users.insert_many([make_user("me"), make_user("other")])
    await _request(client, user="other")
    await client.post("/api/auth/phone/verify", json={"code": _code(sent)}, headers=auth("other"))

    response = await _request(client, user="me")

    assert response.status_code == 409


# ---------- conferma del codice ----------

async def test_correct_code_verifies_the_phone(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await client.post("/api/auth/phone/verify", json={"code": _code(sent)}, headers=auth("me"))

    assert response.status_code == 200
    user = response.json()
    assert user["phone_verified"] is True
    assert user["phone_masked"].endswith("0166")
    assert PHONE not in response.text


async def test_wrong_code_is_refused(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await client.post("/api/auth/phone/verify", json={"code": "000000"}, headers=auth("me"))

    assert response.status_code == 400
    stored = await app_db.users.find_one({"user_id": "me"})
    assert not stored.get("phone_verified")


async def test_code_is_invalidated_after_too_many_wrong_attempts(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)
    right = _code(sent)
    wrong = "000000" if right != "000000" else "111111"
    for _ in range(core.MAX_CODE_ATTEMPTS):
        await client.post("/api/auth/phone/verify", json={"code": wrong}, headers=auth("me"))

    response = await client.post("/api/auth/phone/verify", json={"code": right}, headers=auth("me"))

    assert response.status_code == 400


async def test_expired_code_is_refused(client, app_db, sent):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)
    await app_db.users.update_one({"user_id": "me"}, {"$set": {"phone_code_expires": datetime.now(timezone.utc) - timedelta(minutes=1)}})

    response = await client.post("/api/auth/phone/verify", json={"code": _code(sent)}, headers=auth("me"))

    assert response.status_code == 400


async def test_verify_without_a_request_is_refused(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    response = await client.post("/api/auth/phone/verify", json={"code": "123456"}, headers=auth("me"))

    assert response.status_code == 400


# ---------- obbligo prima del primo favore ----------

def _favor_payload() -> dict:
    return {
        "type": "offer",
        "title": "Aiuto con la spesa",
        "description": "Porto la spesa a casa",
        "category": "Spesa",
        "duration_hours": 1,
        "latitude": 37.9,
        "longitude": 12.3,
    }


async def test_creating_a_favor_needs_a_verified_phone_when_required(client, app_db, monkeypatch):
    monkeypatch.setattr(core, "PHONE_VERIFICATION_REQUIRED", True)
    await app_db.users.insert_one(make_user("me"))

    response = await client.post("/api/favors", json=_favor_payload(), headers=auth("me"))

    assert response.status_code == 403
    assert response.headers.get("x-phone-required") == "true"
    assert await app_db.favors.count_documents({}) == 0


async def test_accepting_a_favor_needs_a_verified_phone_when_required(client, app_db, monkeypatch):
    monkeypatch.setattr(core, "PHONE_VERIFICATION_REQUIRED", True)
    await app_db.users.insert_many([make_user("me"), make_user("creator")])
    await app_db.favors.insert_one(
        make_favor("f1", status="active", accepted_by=None, accepted_by_name=None, expires_at=datetime.now(timezone.utc) + timedelta(days=2))
    )

    response = await client.post("/api/favors/accept", json={"favor_id": "f1"}, headers=auth("me"))

    assert response.status_code == 403
    assert response.headers.get("x-phone-required") == "true"


async def test_verified_user_can_create_favors_when_required(client, app_db, monkeypatch):
    monkeypatch.setattr(core, "PHONE_VERIFICATION_REQUIRED", True)
    await app_db.users.insert_one(make_user("me", phone_verified=True))

    response = await client.post("/api/favors", json=_favor_payload(), headers=auth("me"))

    assert response.status_code == 200


async def test_nothing_changes_while_the_requirement_is_off(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    response = await client.post("/api/favors", json=_favor_payload(), headers=auth("me"))

    assert response.status_code == 200


async def test_reviewer_account_is_exempt(client, app_db, monkeypatch):
    monkeypatch.setattr(core, "PHONE_VERIFICATION_REQUIRED", True)
    await app_db.users.insert_one(make_user("rev", email=core.REVIEWER_EMAIL))

    response = await client.post("/api/favors", json=_favor_payload(), headers=auth("rev"))

    assert response.status_code == 200


# ---------- Twilio Verify (il codice lo genera e lo controlla Twilio) ----------

@pytest.fixture
def verify_service(monkeypatch):
    """Attiva la modalità Verify con un finto servizio Twilio."""
    calls = {"start": [], "check": [], "approved": True}

    async def fake_start(to: str) -> bool:
        calls["start"].append(to)
        return True

    async def fake_check(to: str, code: str) -> bool:
        calls["check"].append((to, code))
        return calls["approved"]

    monkeypatch.setattr(sms, "verify_enabled", lambda: True)
    monkeypatch.setattr(sms, "verify_start", fake_start)
    monkeypatch.setattr(sms, "verify_check", fake_check)
    return calls


def test_verify_enabled_needs_all_three_settings(monkeypatch):
    for name in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"):
        monkeypatch.delenv(name, raising=False)
    assert sms.verify_enabled() is False
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACxxx")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    assert sms.verify_enabled() is False
    monkeypatch.setenv("TWILIO_VERIFY_SERVICE_SID", "VAxxx")
    assert sms.verify_enabled() is True


async def test_verify_request_uses_twilio_and_stores_no_code(client, app_db, sent, verify_service):
    await app_db.users.insert_one(make_user("me"))

    response = await _request(client)

    assert response.status_code == 200
    assert verify_service["start"] == [PHONE]
    assert sent == []
    stored = await app_db.users.find_one({"user_id": "me"})
    assert "phone_code" not in stored
    assert PHONE not in str(stored)


async def test_verify_correct_code_verifies_the_phone(client, app_db, sent, verify_service):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await client.post(
        "/api/auth/phone/verify", json={"code": "123456", "phone": PHONE}, headers=auth("me")
    )

    assert response.status_code == 200
    assert verify_service["check"] == [(PHONE, "123456")]
    user = await app_db.users.find_one({"user_id": "me"})
    assert user["phone_verified"] is True
    assert user["phone_masked"].endswith("0166")
    assert PHONE not in str(user)


async def test_verify_wrong_code_is_refused(client, app_db, sent, verify_service):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)
    verify_service["approved"] = False

    response = await client.post(
        "/api/auth/phone/verify", json={"code": "000000", "phone": PHONE}, headers=auth("me")
    )

    assert response.status_code == 400
    assert not (await app_db.users.find_one({"user_id": "me"})).get("phone_verified")


async def test_verify_with_a_different_phone_is_refused(client, app_db, sent, verify_service):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await client.post(
        "/api/auth/phone/verify", json={"code": "123456", "phone": "+393331112222"}, headers=auth("me")
    )

    assert response.status_code == 400
    assert verify_service["check"] == []


async def test_verify_without_phone_in_body_is_refused(client, app_db, sent, verify_service):
    await app_db.users.insert_one(make_user("me"))
    await _request(client)

    response = await client.post("/api/auth/phone/verify", json={"code": "123456"}, headers=auth("me"))

    assert response.status_code == 400
