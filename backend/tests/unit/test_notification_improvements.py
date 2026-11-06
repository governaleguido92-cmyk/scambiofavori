"""Notifiche in app all'accettazione e promemoria di scadenza; messaggi di limite più utili."""
from datetime import datetime, timedelta, timezone

import pytest
from mongomock_motor import AsyncMongoMockCollection

from conftest import auth, make_favor, make_user


@pytest.fixture
def mongo_like_find_one_and_update(monkeypatch):
    """mongomock restituisce None con return_document + projection (Mongo vero no): si toglie la projection nel test."""
    original = AsyncMongoMockCollection.find_one_and_update

    async def patched(self, *args, **kwargs):
        projection = kwargs.pop("projection", None)
        doc = await original(self, *args, **kwargs)
        if doc and projection and projection.get("_id") == 0:
            doc = {k: v for k, v in doc.items() if k != "_id"}
        return doc

    monkeypatch.setattr(AsyncMongoMockCollection, "find_one_and_update", patched)


def active_favor(favor_id: str, creator: str, expires_in: timedelta) -> dict:
    return make_favor(favor_id, creator_id=creator, creator_name=creator, status="active", accepted_by=None,
                      accepted_by_name=None, approximate_latitude=37.9, approximate_longitude=12.3,
                      expires_at=datetime.now(timezone.utc) + expires_in)


async def notifications(client, user):
    response = await client.get("/api/notifications", headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()


# ---------- accettazione ----------

async def test_creator_gets_an_in_app_notification_when_a_favor_is_accepted(client, app_db, mongo_like_find_one_and_update):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(active_favor("f1", "owner", timedelta(days=3)))

    response = await client.post("/api/favors/accept", json={"favor_id": "f1"}, headers=auth("helper"))

    assert response.status_code == 200, response.text
    items = await notifications(client, "owner")
    accepted = [n for n in items if n["type"] == "favor_accepted"]
    assert len(accepted) == 1
    assert accepted[0]["related_id"] == "f1"
    assert "helper" in accepted[0]["message"]
    assert accepted[0]["read"] is False


# ---------- promemoria di scadenza ----------

async def test_reminder_for_an_unanswered_favor_expiring_within_a_day(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    await app_db.favors.insert_one(active_favor("f1", "owner", timedelta(hours=10)))

    items = await notifications(client, "owner")

    reminders = [n for n in items if n["type"] == "favor_expiring"]
    assert len(reminders) == 1 and reminders[0]["related_id"] == "f1"


async def test_reminder_is_sent_only_once(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    await app_db.favors.insert_one(active_favor("f1", "owner", timedelta(hours=10)))

    await notifications(client, "owner")
    await client.get("/api/notifications/unread-count", headers=auth("owner"))
    items = await notifications(client, "owner")

    assert len([n for n in items if n["type"] == "favor_expiring"]) == 1


async def test_no_reminder_for_far_expiry_accepted_or_other_peoples_favors(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("other", email_verified=True)])
    await app_db.favors.insert_many([
        active_favor("far", "owner", timedelta(days=3)),
        {**active_favor("taken", "owner", timedelta(hours=5)), "status": "accepted", "accepted_by": "other"},
        active_favor("theirs", "other", timedelta(hours=5)),
    ])

    items = await notifications(client, "owner")

    assert [n for n in items if n["type"] == "favor_expiring"] == []


async def test_unread_count_includes_the_expiry_reminder(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    await app_db.favors.insert_one(active_favor("f1", "owner", timedelta(hours=3)))

    response = await client.get("/api/notifications/unread-count", headers=auth("owner"))

    assert response.json()["unread_count"] == 1


# ---------- messaggi di limite ----------

async def test_event_limit_message_says_when_a_slot_frees_up(client, app_db):
    from test_neighborhood_social import create_event, open_favor, people

    await people(app_db, "ann")
    await app_db.favors.insert_one(open_favor("fa", "ann"))
    await create_event(client, "ann", title="Uno")
    await create_event(client, "ann", title="Due")

    response = await create_event(client, "ann", title="Tre")

    assert response.status_code == 429
    assert "Si libera un posto dopo il" in response.json()["detail"]


async def test_hold_message_says_what_is_blocked_and_who_to_write_to(client, app_db):
    await app_db.users.insert_many([make_user("held", email_verified=True, safety_hold=True), make_user("owner", email_verified=True)])
    await app_db.favors.insert_one(active_favor("qualsiasi", "owner", timedelta(days=3)))

    response = await client.post("/api/favors/accept", json={"favor_id": "qualsiasi"}, headers=auth("held"))

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert "infoapp@scambiofavori.it" in detail and "pubblicare" in detail


async def test_not_enough_granelli_message_suggests_how_to_earn_them(client, app_db, mongo_like_find_one_and_update):
    await app_db.users.insert_many([make_user("broke", granelli=0, email_verified=True), make_user("owner", email_verified=True)])
    await app_db.favors.insert_one({**active_favor("offer1", "owner", timedelta(days=3)), "type": "offer", "granelli_cost": 3})

    response = await client.post("/api/favors/accept", json={"favor_id": "offer1"}, headers=auth("broke"))

    assert response.status_code == 400
    assert "Dona un favore" in response.json()["detail"]


# ---------- messaggi raggruppati e favori fermi ----------

async def test_unread_messages_of_one_favor_become_a_single_notification(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted"))

    for text in ("Ciao", "Sto arrivando", "Ci vediamo al portone"):
        response = await client.post("/api/messages", json={"favor_id": "f1", "content": text}, headers=auth("helper"))
        assert response.status_code == 200, response.text

    items = [n for n in await notifications(client, "owner") if n["type"] == "new_message"]
    assert len(items) == 1
    assert items[0]["count"] == 3 and "3 nuovi messaggi" in items[0]["message"]


async def test_new_message_after_reading_starts_a_new_notification(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted"))
    await client.post("/api/messages", json={"favor_id": "f1", "content": "Ciao"}, headers=auth("helper"))
    first = [n for n in await notifications(client, "owner") if n["type"] == "new_message"][0]
    await client.post(f"/api/notifications/read/{first['notification_id']}", headers=auth("owner"))

    await client.post("/api/messages", json={"favor_id": "f1", "content": "Eccomi"}, headers=auth("helper"))

    assert len([n for n in await notifications(client, "owner") if n["type"] == "new_message"]) == 2


async def test_both_parties_are_reminded_once_when_a_favor_is_stalled(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(days=3)))

    for _ in range(2):
        for user in ("owner", "helper"):
            await notifications(client, user)

    for user in ("owner", "helper"):
        stalled = [n for n in await notifications(client, user) if n["type"] == "favor_stalled"]
        assert len(stalled) == 1 and "3 giorni" in stalled[0]["message"]


async def test_no_stalled_reminder_for_a_recent_accepted_favor(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(hours=5)))

    assert [n for n in await notifications(client, "owner") if n["type"] == "favor_stalled"] == []
