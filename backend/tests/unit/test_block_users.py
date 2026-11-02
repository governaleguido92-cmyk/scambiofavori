"""Blocco utenti: chi blocca non vede più l'altro (e viceversa) e solo chi ha bloccato può sbloccare."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user


async def _block(app_db, blocker: str, blocked: str):
    await app_db.blocked_users.insert_one(
        {
            "block_id": f"block_{blocker}_{blocked}",
            "blocker_id": blocker,
            "blocked_id": blocked,
            "reason": None,
            "created_at": datetime.now(timezone.utc),
        }
    )


def _active_favor(favor_id: str, creator: str) -> dict:
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
    )


# ---------- elenco e dettaglio ----------

async def test_list_hides_favors_of_users_i_blocked(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad"), make_user("ok")])
    await app_db.favors.insert_many([_active_favor("f_bad", "bad"), _active_favor("f_ok", "ok")])
    await _block(app_db, "me", "bad")

    response = await client.get("/api/favors", headers=auth("me"))

    assert response.status_code == 200
    ids = [f["favor_id"] for f in response.json()]
    assert ids == ["f_ok"]


async def test_list_hides_favors_of_users_who_blocked_me(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad"), make_user("ok")])
    await app_db.favors.insert_many([_active_favor("f_bad", "bad"), _active_favor("f_ok", "ok")])
    await _block(app_db, "bad", "me")

    response = await client.get("/api/favors", headers=auth("me"))

    assert [f["favor_id"] for f in response.json()] == ["f_ok"]


async def test_single_favor_of_blocked_user_is_not_found(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad")])
    await app_db.favors.insert_one(_active_favor("f_bad", "bad"))
    await _block(app_db, "me", "bad")

    response = await client.get("/api/favors/f_bad", headers=auth("me"))

    assert response.status_code == 404


# ---------- accettare e scrivere ----------

async def test_cannot_accept_favor_of_blocked_user(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad")])
    await app_db.favors.insert_one(_active_favor("f_bad", "bad"))
    await _block(app_db, "me", "bad")

    response = await client.post("/api/favors/accept", json={"favor_id": "f_bad"}, headers=auth("me"))

    assert response.status_code in (403, 404)
    stored = await app_db.favors.find_one({"favor_id": "f_bad"})
    assert stored["status"] == "active"


async def test_cannot_message_a_blocked_user(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())  # creator + helper, accettato
    await _block(app_db, "creator", "helper")

    response = await client.post(
        "/api/messages",
        json={"favor_id": "favor_1", "content": "Ciao, ci vediamo domani"},
        headers=auth("helper"),
    )

    assert response.status_code == 403
    assert await app_db.messages.count_documents({}) == 0


async def test_messages_still_work_without_block(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post(
        "/api/messages",
        json={"favor_id": "favor_1", "content": "Ciao, ci vediamo domani"},
        headers=auth("helper"),
    )

    assert response.status_code == 200


# ---------- sblocco ed elenco ----------

async def test_blocked_user_cannot_remove_the_block(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad")])
    await _block(app_db, "me", "bad")

    response = await client.delete("/api/users/block/me", headers=auth("bad"))

    assert response.status_code == 404
    assert await app_db.blocked_users.count_documents({}) == 1


async def test_blocker_can_unblock(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad")])
    await _block(app_db, "me", "bad")

    response = await client.delete("/api/users/block/bad", headers=auth("me"))

    assert response.status_code == 200
    assert await app_db.blocked_users.count_documents({}) == 0


async def test_blocked_list_only_shows_users_i_blocked(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad"), make_user("hater")])
    await _block(app_db, "me", "bad")
    await _block(app_db, "hater", "me")

    response = await client.get("/api/users/blocked", headers=auth("me"))

    assert response.status_code == 200
    assert [u["user_id"] for u in response.json()["blocked_users"]] == ["bad"]


async def test_block_endpoint_creates_the_block(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("bad")])

    response = await client.post("/api/users/block", json={"user_id": "bad"}, headers=auth("me"))

    assert response.status_code == 200
    assert await app_db.blocked_users.count_documents({"blocker_id": "me", "blocked_id": "bad"}) == 1
