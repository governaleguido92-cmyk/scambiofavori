"""Le email si trovano senza badare alle maiuscole, anche per i vecchi account."""
import re

import core


def test_email_match_ignores_case_and_spaces():
    pattern = core.email_match("  Anna@Demo.Local ")["email"]
    assert pattern["$options"] == "i"
    assert re.match(pattern["$regex"], "anna@demo.local", re.I)
    assert re.match(pattern["$regex"], "ANNA@DEMO.LOCAL", re.I)


def test_email_match_escapes_regex_characters():
    pattern = core.email_match("a.b+c@x.it")["email"]["$regex"]
    assert not re.match(pattern, "axb+c@x.it", re.I)
    assert re.match(pattern, "a.b+c@x.it", re.I)


def test_new_registrations_store_lowercase_email():
    user = core.UserCreate(email=" Anna@Demo.LOCAL ", name="Anna", password="password123")
    assert user.email == "anna@demo.local"


async def test_old_mixed_case_account_can_log_in_with_any_case(client, app_db):
    from tests.unit.conftest import make_user

    await app_db.users.insert_one(make_user("u1", email="Mario.Rossi@Example.com", email_verified=True,
                                            password_hash=core.hash_password("longenough1")))

    for typed in ("mario.rossi@example.com", "MARIO.ROSSI@EXAMPLE.COM", "Mario.Rossi@Example.com"):
        response = await client.post("/api/auth/login", json={"email": typed, "password": "longenough1"})
        assert response.status_code == 200, typed


async def test_registering_same_email_with_other_case_is_refused(client, app_db):
    from tests.unit.conftest import make_user

    await app_db.users.insert_one(make_user("u1", email="Mario.Rossi@Example.com", email_verified=True))
    response = await client.post("/api/auth/register", json={
        "email": "mario.rossi@example.com", "name": "Mario", "password": "longenough1"})
    assert response.status_code == 400
