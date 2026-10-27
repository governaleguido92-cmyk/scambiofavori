"""Auth hardening: OTP brute-force, rate limits, Stripe webhook signature, removed endpoints."""
from datetime import datetime, timedelta, timezone

import core
from conftest import make_user


def future():
    return datetime.now(timezone.utc) + timedelta(hours=1)


async def test_reset_code_is_invalidated_after_max_wrong_attempts(client, app_db):
    await app_db.users.insert_one(make_user("u1", email="a@example.com", reset_code="123456", reset_code_expires=future()))

    for _ in range(core.MAX_CODE_ATTEMPTS):
        wrong = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "000000", "new_password": "longenough1"})
        assert wrong.status_code == 400
    correct_but_late = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "123456", "new_password": "longenough1"})

    assert correct_but_late.status_code == 400
    assert "password_hash" not in await app_db.users.find_one({"user_id": "u1"})


async def test_reset_with_correct_code_works_and_enforces_min_length(client, app_db):
    await app_db.users.insert_one(make_user("u1", email="a@example.com", reset_code="123456", reset_code_expires=future()))

    short = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "123456", "new_password": "short"})
    ok = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "123456", "new_password": "longenough1"})

    assert short.status_code == 400
    assert ok.status_code == 200


async def test_reset_does_not_reveal_whether_email_exists(client, app_db):
    response = await client.post("/api/auth/reset-password", json={"email": "ghost@example.com", "code": "123456", "new_password": "longenough1"})

    assert response.status_code == 400


async def test_email_verification_locks_after_max_attempts(client, app_db):
    await app_db.users.insert_one(make_user("u1", verification_code="654321", verification_code_expires=future(), email_verified=False))

    for _ in range(core.MAX_CODE_ATTEMPTS):
        await client.post("/api/auth/verify-email", json={"user_id": "u1", "code": "000000"})
    late = await client.post("/api/auth/verify-email", json={"user_id": "u1", "code": "654321"})

    assert late.status_code == 400


async def test_login_is_rate_limited(client, app_db, rate_limited):
    statuses = [
        (await client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever1"})).status_code
        for _ in range(12)
    ]

    assert 429 in statuses
    assert statuses[0] == 401


async def test_register_rejects_short_password(client, app_db):
    response = await client.post("/api/auth/register", json={"email": "n@example.com", "name": "N", "password": "short"})

    assert response.status_code == 400


async def test_stripe_webhook_rejected_without_configured_secret(client, monkeypatch):
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)

    response = await client.post("/api/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "t=1,v1=bad"})

    assert response.status_code == 503


async def test_stripe_webhook_rejects_forged_event(client, app_db, monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    await app_db.users.insert_one(make_user("victim"))
    forged = b'{"type":"checkout.session.completed","data":{"object":{"id":"cs_1","metadata":{"user_id":"victim"}}}}'

    no_sig = await client.post("/api/webhook/stripe", content=forged)
    bad_sig = await client.post("/api/webhook/stripe", content=forged, headers={"Stripe-Signature": "t=1,v1=deadbeef"})

    assert no_sig.status_code == 400
    assert bad_sig.status_code == 400
    assert not (await app_db.users.find_one({"user_id": "victim"})).get("is_supporter")


async def test_source_download_endpoints_are_gone(client):
    for path in ("/api/download/frontend", "/api/download/frontend-zip", "/static/scambio-di-favori-frontend.zip"):
        assert (await client.get(path)).status_code == 404, path


def test_otp_codes_are_six_digits_and_vary():
    codes = {core.generate_numeric_code() for _ in range(50)}

    assert all(len(code) == 6 and code.isdigit() for code in codes)
    assert len(codes) > 1
