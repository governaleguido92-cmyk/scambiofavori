"""Elenco delle conversazioni e chiusura della chat a favore concluso."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user

NOW = datetime.now(timezone.utc)


def _msg(favor_id: str, sender: str, text: str, minutes_ago: int, **extra) -> dict:
    return {
        "message_id": f"m_{favor_id}_{sender}_{minutes_ago}",
        "favor_id": favor_id,
        "sender_id": sender,
        "sender_name": sender,
        "content": text,
        "message_type": "text",
        "is_system": False,
        "blocked": False,
        "has_personal_data": False,
        "created_at": NOW - timedelta(minutes=minutes_ago),
        **extra,
    }


async def _setup(app_db, *users):
    await app_db.users.insert_many([make_user(u) for u in users])


# ---------- elenco ----------

async def test_lists_conversation_with_other_user_and_last_message(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_many([_msg("f1", "creator", "Ciao", 10), _msg("f1", "helper", "Arrivo subito", 5)])

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.status_code == 200
    [conv] = response.json()
    assert conv["favor_id"] == "f1"
    assert conv["other_user_id"] == "helper"
    assert conv["other_user_name"] == "helper"
    assert conv["favor_title"] == "Aiuto spesa"
    assert conv["last_message"]["content"] == "Arrivo subito"


async def test_helper_sees_the_creator_as_other_user(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_one(_msg("f1", "creator", "Ciao", 5))

    response = await client.get("/api/conversations", headers=auth("helper"))

    assert response.json()[0]["other_user_id"] == "creator"


async def test_favors_without_messages_are_not_listed(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json() == []


async def test_other_peoples_conversations_are_not_listed(client, app_db):
    await _setup(app_db, "creator", "helper", "stranger")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_one(_msg("f1", "creator", "Ciao", 5))

    response = await client.get("/api/conversations", headers=auth("stranger"))

    assert response.json() == []


async def test_most_recent_conversation_comes_first(client, app_db):
    await _setup(app_db, "me", "a", "b")
    await app_db.favors.insert_many([
        make_favor("f_old", creator_id="me", creator_name="me", accepted_by="a", accepted_by_name="a"),
        make_favor("f_new", creator_id="me", creator_name="me", accepted_by="b", accepted_by_name="b"),
    ])
    await app_db.messages.insert_many([_msg("f_old", "a", "vecchio", 60), _msg("f_new", "b", "nuovo", 2)])

    response = await client.get("/api/conversations", headers=auth("me"))

    assert [c["favor_id"] for c in response.json()] == ["f_new", "f_old"]


async def test_conversations_with_blocked_users_are_hidden(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_one(_msg("f1", "helper", "Ciao", 5))
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "creator", "blocked_id": "helper"})

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json() == []


async def test_conversations_require_login(client, app_db):
    response = await client.get("/api/conversations")

    assert response.status_code == 401


# ---------- non letti ----------

async def test_unread_counts_only_messages_from_the_other_user(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_many([
        _msg("f1", "helper", "uno", 9), _msg("f1", "helper", "due", 8), _msg("f1", "creator", "mio", 7),
    ])

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json()[0]["unread"] == 2


async def test_opening_the_chat_marks_messages_as_read(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_one(_msg("f1", "helper", "uno", 9))

    await client.get("/api/messages/f1", headers=auth("creator"))
    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json()[0]["unread"] == 0


async def test_new_messages_after_reading_are_unread_again(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1"))
    await app_db.messages.insert_one(_msg("f1", "helper", "vecchio", 30))
    await client.get("/api/messages/f1", headers=auth("creator"))
    await app_db.messages.insert_one(_msg("f1", "helper", "nuovo", -1))  # un minuto nel futuro

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json()[0]["unread"] == 1


# ---------- chiusura a favore concluso ----------

async def test_can_write_is_true_while_the_favor_is_in_progress(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="accepted"))
    await app_db.messages.insert_one(_msg("f1", "helper", "ciao", 5))

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json()[0]["can_write"] is True


async def test_can_write_is_false_when_the_favor_is_completed(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="completed", completed_at=NOW))
    await app_db.messages.insert_one(_msg("f1", "helper", "ciao", 5))

    response = await client.get("/api/conversations", headers=auth("creator"))

    assert response.json()[0]["can_write"] is False
    assert response.json()[0]["favor_status"] == "completed"


async def test_cannot_send_messages_right_after_completion(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="completed", completed_at=NOW))

    response = await client.post(
        "/api/messages", json={"favor_id": "f1", "content": "Grazie ancora"}, headers=auth("creator")
    )

    assert response.status_code == 403
    assert await app_db.messages.count_documents({}) == 0


async def test_cannot_send_messages_on_cancelled_favor(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="cancelled", completed_at=NOW))

    response = await client.post(
        "/api/messages", json={"favor_id": "f1", "content": "Ci sei?"}, headers=auth("helper")
    )

    assert response.status_code == 403


async def test_chat_status_is_read_only_as_soon_as_the_favor_is_completed(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="completed", completed_at=NOW))

    response = await client.get("/api/chat/status/f1", headers=auth("creator"))

    assert response.json()["read_only"] is True


async def test_old_messages_can_still_be_read_after_completion(client, app_db):
    await _setup(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="completed", completed_at=NOW))
    await app_db.messages.insert_one(_msg("f1", "helper", "ciao", 5))

    response = await client.get("/api/messages/f1", headers=auth("creator"))

    assert response.status_code == 200
    assert response.json()[0]["content"] == "ciao"
