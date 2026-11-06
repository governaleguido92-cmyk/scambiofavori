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


# ---------- rilascio dei favori fermi da 7 giorni ----------

async def test_favor_accepted_a_week_ago_goes_back_to_active_and_both_are_told(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(days=8),
                                              expires_at=datetime.now(timezone.utc) + timedelta(days=2)))

    items = await notifications(client, "helper")

    stored = await app_db.favors.find_one({"favor_id": "f1"})
    assert stored["status"] == "active" and "accepted_by" not in stored
    assert [n for n in items if n["type"] == "favor_released"]
    assert [n for n in await notifications(client, "owner") if n["type"] == "favor_released"]


async def test_expired_stalled_favor_is_closed_not_reopened(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(days=9),
                                              expires_at=datetime.now(timezone.utc) - timedelta(days=1)))

    await notifications(client, "owner")

    assert (await app_db.favors.find_one({"favor_id": "f1"}))["status"] == "cancelled"


async def test_recently_accepted_favor_is_not_released(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(days=3)))

    await notifications(client, "owner")

    assert (await app_db.favors.find_one({"favor_id": "f1"}))["status"] == "accepted"


async def test_new_helper_at_the_limit_is_freed_by_stalled_favors(client, app_db, mongo_like_find_one_and_update):
    from trust import NEW_USER_MAX_ACCEPTED_FAVORS

    await app_db.users.insert_many([make_user("helper", email_verified=True), make_user("fresh", email_verified=True)])
    old = datetime.now(timezone.utc) - timedelta(days=8)
    await app_db.favors.insert_many([
        make_favor(f"old{i}", creator_id=f"c{i}", creator_name=f"c{i}", accepted_by="helper", accepted_by_name="helper",
                   status="accepted", accepted_at=old, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        for i in range(NEW_USER_MAX_ACCEPTED_FAVORS)
    ])
    await app_db.favors.insert_one(active_favor("new1", "fresh", timedelta(days=3)))

    response = await client.post("/api/favors/accept", json={"favor_id": "new1"}, headers=auth("helper"))

    assert response.status_code == 200, response.text


# ---------- la posizione mandata in chat non è una truffa ----------

def test_location_link_with_long_coordinates_is_not_flagged_as_scam():
    import core

    link = "📍 La mia posizione attuale:\nhttps://maps.google.com/?q=37.930123456789012,12.330123456789012"
    assert core.contains_scam_hint(link) is False


def test_short_location_link_is_not_flagged():
    import core

    assert core.contains_scam_hint("https://maps.google.com/?q=37.93012,12.33012") is False


def test_card_number_next_to_a_location_link_is_still_flagged():
    import core

    text = "https://maps.google.com/?q=37.93012,12.33012 il mio numero di carta 4111 1111 1111 1111"
    assert core.contains_scam_hint(text) is True


def test_long_number_without_the_app_link_is_still_flagged():
    import core

    assert core.contains_scam_hint("37.930123456789012 12.330123456789012") is True


async def test_chat_accepts_the_location_message_the_app_sends(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted"))
    text = "📍 La mia posizione attuale:\nhttps://maps.google.com/?q=37.930123456789012,12.330123456789012"

    response = await client.post("/api/messages", json={"favor_id": "f1", "content": text}, headers=auth("helper"))
    short = await client.post("/api/messages", json={"favor_id": "f1", "content": "📍 La mia posizione attuale:\nhttps://maps.google.com/?q=37.93012,12.33012"}, headers=auth("owner"))

    assert response.status_code == 200, response.text
    assert short.status_code == 200, short.text


async def test_favors_already_accepted_do_not_count_against_the_new_user_cap(client, app_db):
    from trust import NEW_USER_MAX_OPEN_FAVORS

    from test_trust_safety import FAVOR_BODY

    await app_db.users.insert_many([make_user("me", granelli=100), make_user("helper", email_verified=True)])
    await app_db.favors.insert_many([
        make_favor(f"acc{i}", creator_id="me", creator_name="me", accepted_by="helper", accepted_by_name="helper",
                   status="accepted", accepted_at=datetime.now(timezone.utc))
        for i in range(NEW_USER_MAX_OPEN_FAVORS)
    ])

    response = await client.post("/api/favors", json=FAVOR_BODY, headers=auth("me"))

    assert response.status_code == 200, response.text


async def test_stalled_reminder_after_one_day_speaks_in_the_singular(client, app_db):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="accepted",
                                              accepted_at=datetime.now(timezone.utc) - timedelta(hours=30)))

    stalled = [n for n in await notifications(client, "owner") if n["type"] == "favor_stalled"]

    assert len(stalled) == 1 and "da 1 giorno:" in stalled[0]["message"]


# ---------- una sola voce quando il favore si conclude ----------

async def completed_with_notices(app_db, read_completion=False):
    await app_db.users.insert_many([make_user("owner", email_verified=True), make_user("helper", email_verified=True)])
    await app_db.favors.insert_one(make_favor("f1", creator_id="owner", creator_name="owner", accepted_by="helper",
                                              accepted_by_name="helper", status="completed",
                                              completed_at=datetime.now(timezone.utc)))
    for user in ("owner", "helper"):
        await app_db.notifications.insert_one({
            "notification_id": f"n_{user}", "user_id": user, "type": "favor_completed", "title": "Favore Completato! 🎉",
            "message": "Il favore è stato completato.", "related_id": "f1", "read": read_completion,
            "created_at": datetime.now(timezone.utc)})


async def test_review_and_cycle_lines_are_added_to_the_completion_notification(client, app_db):
    await completed_with_notices(app_db)

    for reviewer in ("owner", "helper"):
        response = await client.post("/api/reviews", json={"favor_id": "f1", "rating": 5}, headers=auth(reviewer))
        assert response.status_code == 200, response.text

    items = await notifications(client, "owner")
    assert [n["type"] for n in items] == ["favor_completed"]
    assert "recensione" in items[0]["message"] and "Entrambe le recensioni" in items[0]["message"]


async def test_review_after_the_completion_was_read_is_a_separate_notification(client, app_db):
    await completed_with_notices(app_db, read_completion=True)

    response = await client.post("/api/reviews", json={"favor_id": "f1", "rating": 5}, headers=auth("owner"))
    assert response.status_code == 200, response.text

    types = [n["type"] for n in await notifications(client, "helper")]
    assert "review_received" in types and types.count("favor_completed") == 1


async def test_badge_is_added_to_a_fresh_completion_notification(app_db):
    import core

    await app_db.users.insert_one(make_user("helper", email_verified=True, total_favors_given=1))
    await app_db.notifications.insert_one({
        "notification_id": "n1", "user_id": "helper", "type": "favor_completed", "title": "Favore Completato! 🎉",
        "message": "Hai completato un favore.", "related_id": "f1", "read": False, "created_at": datetime.now(timezone.utc)})

    merged = await core.merge_into_completion_notification("helper", "🏅 Nuovo badge: «Test»", max_age_seconds=180)

    assert merged is True
    stored = await app_db.notifications.find_one({"notification_id": "n1"})
    assert "Nuovo badge" in stored["message"]


async def test_nothing_to_merge_into_returns_false(app_db):
    import core

    await app_db.users.insert_one(make_user("helper", email_verified=True))
    assert await core.merge_into_completion_notification("helper", "riga", max_age_seconds=180) is False


# ---------- Granelli impegnati ----------

async def test_cannot_promise_more_granelli_than_you_have_across_open_requests(client, app_db):
    from test_trust_safety import FAVOR_BODY

    await app_db.users.insert_one(make_user("me", granelli=3))
    one_hour = {**FAVOR_BODY, "duration_hours": 1.0, "is_emergency": False}

    codes = [(await client.post("/api/favors", json=one_hour, headers=auth("me"))).status_code for _ in range(4)]

    assert codes == [200, 200, 200, 400]
    last = await client.post("/api/favors", json=one_hour, headers=auth("me"))
    assert "impegnati" in last.json()["detail"] and "Dona un favore" in last.json()["detail"]


async def test_committed_granelli_count_requests_and_accepted_offers_only(app_db):
    import trust

    await app_db.favors.insert_many([
        make_favor("r1", creator_id="u", type="request", status="active", granelli_cost=2, accepted_by=None),
        make_favor("r2", creator_id="u", type="request", status="accepted", granelli_cost=1),
        make_favor("done", creator_id="u", type="request", status="completed", granelli_cost=5),
        make_favor("o_mine", creator_id="u", type="offer", status="active", granelli_cost=4, accepted_by=None),
        make_favor("o_taken", creator_id="x", type="offer", status="accepted", granelli_cost=3, accepted_by="u"),
        make_favor("o_other", creator_id="x", type="offer", status="active", granelli_cost=7, accepted_by=None),
    ])

    assert await trust.committed_granelli("u") == 2 + 1 + 3


async def test_skill_match_notifications_are_grouped_in_one(app_db):
    import core

    await app_db.users.insert_many([
        make_user("giver", email_verified=True, skills=["Spesa"], approximate_latitude=37.93, approximate_longitude=12.33),
        make_user("asker", email_verified=True)])
    for i in range(3):
        favor = make_favor(f"s{i}", creator_id="asker", creator_name="asker", type="request", status="active",
                           accepted_by=None, category="Spesa", title=f"Spesa {i}",
                           approximate_latitude=37.93, approximate_longitude=12.33)
        await core.create_skill_match_notifications(favor)

    items = await app_db.notifications.find({"user_id": "giver", "type": "skill_match"}).to_list(10)
    assert len(items) == 1
    assert items[0]["count"] == 3 and "3 favori" in items[0]["message"]


async def test_skill_match_after_reading_starts_a_new_notification(app_db):
    import core

    await app_db.users.insert_many([make_user("giver", email_verified=True, skills=["Spesa"]), make_user("asker", email_verified=True)])
    first = make_favor("s1", creator_id="asker", creator_name="asker", type="request", status="active", accepted_by=None,
                       category="Spesa", title="Spesa 1")
    await core.create_skill_match_notifications(first)
    await app_db.notifications.update_many({"user_id": "giver"}, {"$set": {"read": True}})

    await core.create_skill_match_notifications({**first, "favor_id": "s2", "title": "Spesa 2"})

    assert await app_db.notifications.count_documents({"user_id": "giver", "type": "skill_match"}) == 2


# ---------- richieste che bloccano i Granelli ----------

async def test_one_reminder_for_requests_waiting_more_than_a_day(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    old = datetime.now(timezone.utc) - timedelta(hours=30)
    await app_db.favors.insert_many([
        {**active_favor(f"w{i}", "owner", timedelta(days=2)), "type": "request", "granelli_cost": 1, "created_at": old}
        for i in range(3)
    ] + [{**active_favor("fresh", "owner", timedelta(days=2)), "type": "request", "granelli_cost": 1}])

    first = [n for n in await notifications(client, "owner") if n["type"] == "favor_waiting"]
    again = [n for n in await notifications(client, "owner") if n["type"] == "favor_waiting"]

    assert len(first) == 1 and first[0]["count"] == 3 and "3 richieste" in first[0]["message"] and "3 Granelli" in first[0]["message"]
    assert len(again) == 1


async def test_no_waiting_reminder_for_offers_or_recent_requests(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    old = datetime.now(timezone.utc) - timedelta(hours=30)
    await app_db.favors.insert_many([
        {**active_favor("offer1", "owner", timedelta(days=2)), "type": "offer", "created_at": old},
        {**active_favor("new1", "owner", timedelta(days=2)), "type": "request"},
    ])

    assert [n for n in await notifications(client, "owner") if n["type"] == "favor_waiting"] == []


async def test_not_enough_granelli_message_points_to_i_miei(client, app_db):
    from test_trust_safety import FAVOR_BODY

    await app_db.users.insert_one(make_user("me", granelli=1))
    one_hour = {**FAVOR_BODY, "duration_hours": 1.0, "is_emergency": False}
    await client.post("/api/favors", json=one_hour, headers=auth("me"))

    refused = await client.post("/api/favors", json=one_hour, headers=auth("me"))

    assert refused.status_code == 400
    assert "I Miei" in refused.json()["detail"] and "Annulla o modifica" in refused.json()["detail"]


# ---------- poche urgenze alla volta ----------

async def test_a_person_cannot_have_more_than_two_active_emergencies(client, app_db):
    from test_trust_safety import FAVOR_BODY

    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))
    urgent = {**FAVOR_BODY, "duration_hours": 1.0, "is_emergency": True}

    codes = [(await client.post("/api/favors", json=urgent, headers=auth("me"))).status_code for _ in range(3)]

    assert codes == [200, 200, 403]
    refused = await client.post("/api/favors", json=urgent, headers=auth("me"))
    assert "2 urgenze" in refused.json()["detail"]
    normal = await client.post("/api/favors", json={**urgent, "is_emergency": False}, headers=auth("me"))
    assert normal.status_code == 200, normal.text


async def test_answered_emergencies_free_the_slot(client, app_db):
    from test_trust_safety import FAVOR_BODY

    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))
    await app_db.favors.insert_many([
        {**active_favor(f"e{i}", "me", timedelta(days=1)), "is_emergency": True, "status": "accepted", "accepted_by": "x"}
        for i in range(2)])

    response = await client.post("/api/favors", json={**FAVOR_BODY, "duration_hours": 1.0, "is_emergency": True}, headers=auth("me"))

    assert response.status_code == 200, response.text
