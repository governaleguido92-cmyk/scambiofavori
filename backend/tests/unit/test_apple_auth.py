"""POST /api/auth/apple must only trust a token genuinely signed by Apple for this app."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

import core
from conftest import make_user

AUDIENCE = "com.emergent.scambiodifavori"
ISSUER = "https://appleid.apple.com"


@pytest.fixture(scope="module")
def apple_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def other_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def trust_test_apple_key(monkeypatch, apple_key):
    """Pretend Apple's published key is our test key (no network in unit tests)."""
    monkeypatch.setattr(core, "get_apple_signing_key", lambda token: apple_key.public_key())


def make_token(key, *, sub="apple_sub_1", email="new.user@example.com", aud=AUDIENCE, iss=ISSUER, exp_in=600):
    claims = {"iss": iss, "aud": aud, "sub": sub, "email": email, "exp": int(time.time()) + exp_in}
    return jwt.encode(claims, key, algorithm="RS256")


async def login(client, token, **extra):
    return await client.post("/api/auth/apple", json={"identity_token": token, "user_id": "x", **extra})


async def test_unsigned_forged_token_is_rejected(client, app_db):
    await app_db.users.insert_one(make_user("victim", email="victim@example.com"))
    forged = jwt.encode({"sub": "attacker", "email": "victim@example.com"}, key="", algorithm="none")

    response = await login(client, forged, email="victim@example.com")

    assert response.status_code == 401


async def test_token_signed_with_a_different_key_is_rejected(client, app_db, other_key):
    response = await login(client, make_token(other_key))

    assert response.status_code == 401


async def test_token_for_another_app_is_rejected(client, app_db, apple_key):
    response = await login(client, make_token(apple_key, aud="com.someone.else"))

    assert response.status_code == 401


async def test_expired_token_is_rejected(client, app_db, apple_key):
    response = await login(client, make_token(apple_key, exp_in=-60))

    assert response.status_code == 401


async def test_valid_token_creates_account_from_the_verified_email(client, app_db, apple_key):
    response = await login(client, make_token(apple_key, email="new.user@example.com"))

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "new.user@example.com"
    assert await app_db.users.find_one({"email": "new.user@example.com", "apple_user_id": "apple_sub_1"})


async def test_email_in_request_body_cannot_take_over_another_account(client, app_db, apple_key):
    await app_db.users.insert_one(make_user("victim", email="victim@example.com"))

    response = await login(client, make_token(apple_key, sub="attacker_sub", email="attacker@example.com"), email="victim@example.com")

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] != "victim"
    assert response.json()["user"]["email"] == "attacker@example.com"


async def test_returning_apple_user_is_matched_by_apple_id(client, app_db, apple_key):
    await app_db.users.insert_one(make_user("u_apple", email="old@example.com", apple_user_id="apple_sub_1"))

    response = await login(client, make_token(apple_key, sub="apple_sub_1", email="old@example.com"))

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == "u_apple"
