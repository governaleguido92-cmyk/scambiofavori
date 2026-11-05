"""Fix dell'audit di sicurezza: donazioni atomiche, coordinate finite, feed senza dati altrui, segnalazioni solo tra partecipanti."""
import asyncio
from datetime import datetime, timedelta, timezone

import core
from conftest import auth, make_favor, make_user


def favor_body(**extra):
    return {"type": "request", "title": "Spesa", "description": "Aiuto con la spesa", "category": "Altro", **extra}


async def test_parallel_donations_cannot_spend_the_same_granelli_twice(client, app_db):
    await app_db.users.insert_many([make_user("donor", granelli=3), make_user("friend", granelli=0)])

    results = await asyncio.gather(*[
        client.post("/api/donations", json={"amount": 3, "recipient_id": "friend"}, headers=auth("donor"))
        for _ in range(8)
    ])

    assert sum(r.status_code == 200 for r in results) == 1
    assert (await app_db.users.find_one({"user_id": "friend"}))["granelli"] == 3
    assert (await app_db.users.find_one({"user_id": "donor"}))["granelli"] == 0


async def test_cannot_donate_to_yourself(client, app_db):
    await app_db.users.insert_one(make_user("donor", granelli=5))

    response = await client.post("/api/donations", json={"amount": 1, "recipient_id": "donor"}, headers=auth("donor"))

    assert response.status_code == 400


async def test_parallel_debt_recovery_pays_only_once(client, app_db):
    await app_db.users.insert_many([make_user("poor", granelli=-4, total_favors_given=2)])
    await app_db.donations.insert_one({"donation_id": "d1", "is_solidarity_fund": True, "amount": 50})

    results = await asyncio.gather(*[
        client.post("/api/debt-recovery/request", headers=auth("poor")) for _ in range(6)
    ])

    assert sum(r.status_code == 200 for r in results) == 1
    assert (await app_db.users.find_one({"user_id": "poor"}))["granelli"] == -1


async def test_favor_with_nan_coordinates_is_rejected(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    raw = '{"type":"request","title":"t","description":"d","category":"Altro","latitude":NaN,"longitude":12.3}'

    response = await client.post("/api/favors", content=raw, headers={**auth("me"), "Content-Type": "application/json"})

    assert response.status_code == 422


async def test_favor_with_out_of_range_coordinates_or_duration_is_rejected(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    far = await client.post("/api/favors", json=favor_body(latitude=95, longitude=12), headers=auth("me"))
    long = await client.post("/api/favors", json=favor_body(duration_hours=100000), headers=auth("me"))
    huge = await client.post("/api/favors", json=favor_body(title="x" * 500), headers=auth("me"))

    assert far.status_code == 422
    assert long.status_code == 422
    assert huge.status_code == 422


async def test_feed_hides_private_statuses_and_addresses_of_others(client, app_db):
    await app_db.users.insert_many([make_user("owner"), make_user("me"), make_user("busy")])
    soon = datetime.now(timezone.utc) + timedelta(days=2)
    await app_db.favors.insert_many([
        make_favor("open", creator_id="owner", creator_name="owner", status="active", accepted_by=None,
                   address="Via Roma 1", expires_at=soon),
        make_favor("taken", creator_id="owner", creator_name="owner", status="accepted", accepted_by="busy",
                   address="Via Roma 1"),
    ])

    active = await client.get("/api/favors", headers=auth("me"))
    accepted = await client.get("/api/favors?status=accepted", headers=auth("me"))
    detail_taken = await client.get("/api/favors/taken", headers=auth("me"))
    detail_open = await client.get("/api/favors/open", headers=auth("me"))

    assert [f["favor_id"] for f in active.json()] == ["open"]
    assert active.json()[0]["address"] is None
    assert accepted.json() == []
    assert detail_taken.status_code == 404
    assert detail_open.json()["address"] is None
    own = await client.get("/api/favors/open", headers=auth("owner"))
    assert own.json()["address"] == "Via Roma 1"


async def test_thanks_board_needs_login_and_caps_limit(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    assert (await client.get("/api/thanks")).status_code == 401
    assert (await client.get("/api/thanks?limit=10000000", headers=auth("me"))).status_code == 422
    assert (await client.get("/api/thanks?limit=5", headers=auth("me"))).status_code == 200


async def test_chat_report_must_target_the_other_participant(client, app_db):
    await app_db.users.insert_many([make_user("a"), make_user("b"), make_user("victim")])
    await app_db.favors.insert_one(make_favor("f1", creator_id="a", creator_name="a", accepted_by="b", status="accepted"))

    wrong = await client.post("/api/chat/report", json={"favor_id": "f1", "reported_user_id": "victim", "reason": "spam"}, headers=auth("a"))
    right = await client.post("/api/chat/report", json={"favor_id": "f1", "reported_user_id": "b", "reason": "spam"}, headers=auth("a"))

    assert wrong.status_code == 400
    assert right.status_code == 200


async def test_unread_count_only_for_participants(client, app_db):
    await app_db.users.insert_many([make_user("a"), make_user("b"), make_user("spy")])
    await app_db.favors.insert_one(make_favor("f1", creator_id="a", creator_name="a", accepted_by="b", status="accepted"))

    assert (await client.get("/api/messages/f1/unread", headers=auth("b"))).status_code == 200
    assert (await client.get("/api/messages/f1/unread", headers=auth("spy"))).status_code == 404


async def test_code_check_survives_parallel_guesses_and_non_ascii(client, app_db):
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await app_db.users.insert_one(make_user("u1", email="a@example.com", reset_code="123456", reset_code_expires=expires))

    results = await asyncio.gather(*[
        client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": f"00000{i}", "new_password": "longenough1"})
        for i in range(20)
    ])
    unicode_code = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "12345é", "new_password": "longenough1"})
    late = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "123456", "new_password": "longenough1"})

    assert all(r.status_code == 400 for r in results)
    assert unicode_code.status_code == 400
    assert late.status_code == 400  # il codice è stato invalidato dopo il tetto di tentativi
    assert (await app_db.users.find_one({"user_id": "u1"}))["reset_attempts"] <= core.MAX_CODE_ATTEMPTS


async def test_password_reset_invalidates_old_sessions(client, app_db):
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await app_db.users.insert_one(make_user("u1", email="a@example.com", reset_code="123456", reset_code_expires=expires))
    old = auth("u1")
    assert (await client.get("/api/auth/me", headers=old)).status_code == 200
    await asyncio.sleep(1.1)  # i JWT hanno precisione al secondo

    ok = await client.post("/api/auth/reset-password", json={"email": "a@example.com", "code": "123456", "new_password": "longenough1"})

    assert ok.status_code == 200
    assert (await client.get("/api/auth/me", headers=old)).status_code == 401


async def seed_qr_favor(app_db, **extra):
    await app_db.users.insert_many([make_user("payer"), make_user("helper")])
    await app_db.favors.insert_one(make_favor(
        "fq", creator_id="payer", creator_name="payer", accepted_by="helper", status="accepted", type="request",
        qr_code="tokenqr12345", exact_latitude=37.9340, exact_longitude=12.3260, **extra))


async def test_qr_scan_needs_position_when_favor_has_a_place(client, app_db):
    await seed_qr_favor(app_db)

    response = await client.post("/api/favors/fq/verify-qr", json={"qr_code": "tokenqr12345"}, headers=auth("helper"))

    assert response.status_code == 400
    assert "posizione" in response.json()["detail"].lower()


async def test_qr_scan_far_away_is_refused_and_nearby_works(client, app_db):
    await seed_qr_favor(app_db)

    far = await client.post("/api/favors/fq/verify-qr", headers=auth("helper"),
                            json={"qr_code": "tokenqr12345", "latitude": 38.1, "longitude": 12.5, "accuracy_meters": 10})
    near = await client.post("/api/favors/fq/verify-qr", headers=auth("helper"),
                             json={"qr_code": "tokenqr12345", "latitude": 37.93402, "longitude": 12.32602, "accuracy_meters": 10})

    assert far.status_code == 400
    assert "lontani" in far.json()["detail"]
    assert near.status_code == 200


async def test_login_refuses_unverified_email_and_resends_code(client, app_db, monkeypatch):
    sent = []

    async def fake_send(email, code, name):
        sent.append(email)
        return True

    monkeypatch.setattr("routers.auth_routes.send_verification_email", fake_send)
    await app_db.users.insert_one(make_user("u1", email="u1@example.com", email_verified=False,
                                            password_hash=core.hash_password("longenough1")))

    response = await client.post("/api/auth/login", json={"email": "u1@example.com", "password": "longenough1"})
    again = await client.post("/api/auth/login", json={"email": "u1@example.com", "password": "longenough1"})
    wrong = await client.post("/api/auth/login", json={"email": "u1@example.com", "password": "sbagliata12"})

    assert response.status_code == 403
    assert response.headers["x-email-unverified"] == "true"
    assert response.headers["x-user-id"] == "u1"
    assert again.status_code == 403
    assert wrong.status_code == 401
    assert sent == ["u1@example.com"]  # il secondo tentativo, entro un minuto, non rimanda un'altra email
    await app_db.users.update_one({"user_id": "u1"}, {"$set": {"email_verified": True}})
    ok = await client.post("/api/auth/login", json={"email": "u1@example.com", "password": "longenough1"})
    assert ok.status_code == 200


# ---------- Accesso con Google senza servizi di terzi ----------

async def test_google_login_is_off_until_client_ids_are_configured(client, app_db):
    nonce = (await client.get("/api/auth/google/nonce")).json()
    response = await client.post("/api/auth/google", json={"id_token": "x" * 30, "nonce": nonce["nonce"]})

    assert nonce["enabled"] is False
    assert response.status_code == 503


async def test_google_login_rejects_forged_token_even_with_client_id(client, app_db, monkeypatch):
    import google_auth
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_IDS", ["client-id.apps.googleusercontent.com"])
    nonce = (await client.get("/api/auth/google/nonce")).json()["nonce"]

    response = await client.post("/api/auth/google", json={"id_token": "aaa.bbb.ccc", "nonce": nonce})

    assert response.status_code == 401


async def test_google_nonce_is_signed_expiring_and_single_use(client, app_db, monkeypatch):
    from conftest import google_login
    forged = await client.post("/api/auth/google", json={"id_token": "x", "nonce": "abc.123.def"})
    assert forged.status_code == 401

    nonce = (await client.get("/api/auth/google/nonce")).json()["nonce"]
    parts = nonce.split(".")
    old = f"{parts[0]}.{int(parts[1]) - 3600}.{parts[2]}"
    assert (await client.post("/api/auth/google", json={"id_token": "x", "nonce": old})).status_code == 401

    first = await google_login(client, monkeypatch, "once@example.com")
    assert first.status_code == 200
    assert first.json()["user"]["email"] == "once@example.com"
    # stesso nonce di nuovo: rifiutato (il test helper ne chiede uno nuovo, quindi si riusa il primo a mano)
    used = await app_db.google_nonces.find_one({})
    replay = await client.post("/api/auth/google", json={"id_token": "x", "nonce": used["_id"]})
    assert replay.status_code == 401


def test_google_nonce_helpers_roundtrip():
    import google_auth
    nonce = google_auth.make_nonce("segreto")
    assert google_auth.check_nonce_format("segreto", nonce) == nonce
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        google_auth.check_nonce_format("altro-segreto", nonce)


async def test_google_id_token_checks_audience_issuer_nonce_and_email(monkeypatch):
    import time
    import jwt
    import pytest
    from cryptography.hazmat.primitives.asymmetric import rsa
    from fastapi import HTTPException
    import google_auth

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class FakeKey:
        key = private.public_key()

    monkeypatch.setattr(google_auth._jwk_client, "get_signing_key_from_jwt", lambda token: FakeKey())
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_IDS", ["mio-client"])

    def token(**over):
        now = int(time.time())
        claims = {"iss": "https://accounts.google.com", "aud": "mio-client", "sub": "1", "iat": now, "exp": now + 300,
                  "nonce": "n1", "email": "a@example.com", "email_verified": True, "name": "Anna"}
        claims.update(over)
        return jwt.encode({k: v for k, v in claims.items() if v is not None}, private, algorithm="RS256")

    ok = await google_auth.verify_google_id_token(token(), "n1")
    assert ok["email"] == "a@example.com" and ok["name"] == "Anna"

    for bad in (token(aud="altra-app"), token(iss="https://evil.example"), token(nonce="altro"),
                token(email_verified=False), token(exp=int(time.time()) - 3600), token(email=None)):
        with pytest.raises(HTTPException):
            await google_auth.verify_google_id_token(bad, "n1")


# ---------- Cookie solo in lettura (CSRF) e webhook Stripe ----------

async def test_cookie_alone_cannot_change_data_but_bearer_can(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    token = core.create_jwt_token("me")

    cookie_read = await client.get("/api/auth/me", cookies={"session_token": token})
    cookie_write = await client.put("/api/user/bio", json={"bio": "ciao"}, cookies={"session_token": token})
    bearer_write = await client.put("/api/user/bio", json={"bio": "ciao"}, headers={"Authorization": f"Bearer {token}"})

    assert cookie_read.status_code == 200
    assert cookie_write.status_code == 401
    assert bearer_write.status_code == 200


def stripe_event(monkeypatch, event):
    import stripe

    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe.Webhook, "construct_event", staticmethod(lambda body, sig, secret: event))


async def test_stripe_revoke_events_find_the_user_by_stripe_ids(client, app_db, monkeypatch):
    await app_db.users.insert_many([
        make_user("sub_user", is_supporter=True, subscription_status="active", badges=["supporter"], stripe_subscription_id="sub_123"),
        make_user("cust_user", is_supporter=True, subscription_status="active", badges=["supporter"], stripe_customer_id="cus_456"),
    ])

    stripe_event(monkeypatch, {"type": "customer.subscription.deleted", "data": {"object": {"id": "sub_123", "customer": "cus_x"}}})
    assert (await client.post("/api/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "t"})).status_code == 200
    stripe_event(monkeypatch, {"type": "invoice.payment_failed", "data": {"object": {"id": "in_1", "subscription": "sub_zzz", "customer": "cus_456"}}})
    assert (await client.post("/api/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "t"})).status_code == 200

    for user_id in ("sub_user", "cust_user"):
        doc = await app_db.users.find_one({"user_id": user_id})
        assert doc["is_supporter"] is False and doc["subscription_status"] == "cancelled"
        assert "supporter" not in doc["badges"]


async def test_stripe_checkout_completed_saves_ids_for_later_revokes(client, app_db, monkeypatch):
    await app_db.users.insert_one(make_user("payer"))
    stripe_event(monkeypatch, {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_1", "metadata": {"user_id": "payer"}, "payment_status": "paid", "subscription": "sub_9", "customer": "cus_9"}}})

    assert (await client.post("/api/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "t"})).status_code == 200

    doc = await app_db.users.find_one({"user_id": "payer"})
    assert doc["is_supporter"] is True
    assert doc["stripe_subscription_id"] == "sub_9" and doc["stripe_customer_id"] == "cus_9"
    assert "supporter" in doc["badges"]


async def test_stripe_webhook_error_returns_500_without_details(client, app_db, monkeypatch):
    stripe_event(monkeypatch, {"type": "checkout.session.completed", "data": None})

    response = await client.post("/api/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "t"})

    assert response.status_code == 500
    assert "NoneType" not in response.text
