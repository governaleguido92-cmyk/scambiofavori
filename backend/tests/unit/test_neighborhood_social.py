"""Quartiere: eventi e ritrovi (con 'ci vado') e presentazioni dei nuovi vicini (con 'benvenuto')."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300
EVENTS = "/api/neighborhood/events"
INTRO = "/api/neighborhood/intro"
INTROS = "/api/neighborhood/intros"


def km_north(km: float) -> float:
    return LAT + km / 111.0


def open_favor(favor_id: str, user: str, km: float = 0.0) -> dict:
    return make_favor(favor_id, creator_id=user, creator_name=user, status="active", accepted_by=None, accepted_by_name=None,
                      approximate_latitude=km_north(km), approximate_longitude=LON,
                      expires_at=datetime.now(timezone.utc) + timedelta(days=3))


async def people(app_db, *names):
    await app_db.users.insert_many([make_user(n, email_verified=True) for n in names])


def starts_in(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def event_body(**extra) -> dict:
    return {"kind": "evento", "title": "Pulizia della spiaggia", "description": "Portiamo guanti e sacchi",
            "place": "Spiaggia del Bue Marino", "starts_at": starts_in(48), **extra}


async def create_event(client, user, **extra):
    return await client.post(EVENTS, json=event_body(**extra), headers=auth(user))


async def events(client, user):
    response = await client.get(EVENTS, headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()["events"]


# ---------- eventi e ritrovi ----------

async def test_creating_an_event_needs_an_active_favor(client, app_db):
    await people(app_db, "me")
    assert (await create_event(client, "me")).status_code == 403


async def test_event_is_seen_by_neighbors_within_30_km_only(client, app_db):
    await people(app_db, "anna", "near", "far")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "near", 10), open_favor("f3", "far", 60)])
    assert (await create_event(client, "anna")).status_code == 200

    assert [e["title"] for e in await events(client, "near")] == ["Pulizia della spiaggia"]
    assert await events(client, "far") == []


async def test_event_shows_kind_place_and_hides_coordinates(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco", 3)])
    await create_event(client, "anna", kind="ritrovo", title="Caffè in piazza", place="Piazza principale")
    event = (await events(client, "marco"))[0]

    assert event["kind"] == "ritrovo" and event["place"] == "Piazza principale" and event["mine"] is False
    assert event["distance_km"] == 5
    assert "latitude" not in event and "longitude" not in event


@pytest.mark.parametrize("extra", [
    {"title": ""}, {"place": ""}, {"kind": "festa"}, {"title": "a" * 61}, {"description": "a" * 201},
    {"title": "Chiamami al 345 000 1234"}, {"description": "Scrivimi su WhatsApp"}, {"place": "https://esempio.it"},
    {"title": "Pago 50 euro"}, {"starts_in": 0}, {"starts_at": "non una data"},
])
async def test_unsafe_or_invalid_events_are_refused(client, app_db, extra):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    body = event_body(**{k: v for k, v in extra.items() if k != "starts_in"})
    if "starts_in" in extra:
        body["starts_at"] = starts_in(-2)
    assert (await client.post(EVENTS, json=body, headers=auth("me"))).status_code == 400


async def test_event_cannot_be_more_than_30_days_away(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await create_event(client, "me", starts_at=starts_in(24 * 31))).status_code == 400


async def test_two_open_events_per_person_at_most(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    codes = [(await create_event(client, "me", title=f"Evento {i}")).status_code for i in range(3)]
    assert codes == [200, 200, 429]


async def test_past_events_disappear_from_the_list(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    await create_event(client, "anna")
    await app_db.neighborhood_events.update_one({}, {"$set": {"starts_at": datetime.now(timezone.utc) - timedelta(days=1)}})
    assert await events(client, "marco") == []


async def test_joining_toggles_and_counts_attendees(client, app_db):
    await people(app_db, "anna", "marco", "luca")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco", 2), open_favor("f3", "luca", 2)])
    event_id = (await create_event(client, "anna")).json()["event_id"]

    assert (await client.post(f"{EVENTS}/{event_id}/join", headers=auth("marco"))).json()["going"] is True
    await client.post(f"{EVENTS}/{event_id}/join", headers=auth("luca"))
    seen = (await events(client, "marco"))[0]
    assert seen["attendees"] == 2 and seen["going"] is True

    assert (await client.post(f"{EVENTS}/{event_id}/join", headers=auth("marco"))).json()["going"] is False
    assert (await events(client, "luca"))[0]["attendees"] == 1


async def test_author_cannot_join_own_event_and_far_users_cannot_join(client, app_db):
    await people(app_db, "anna", "far")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "far", 60)])
    event_id = (await create_event(client, "anna")).json()["event_id"]
    assert (await client.post(f"{EVENTS}/{event_id}/join", headers=auth("anna"))).status_code == 400
    assert (await client.post(f"{EVENTS}/{event_id}/join", headers=auth("far"))).status_code == 403


async def test_author_can_delete_but_others_cannot(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    event_id = (await create_event(client, "anna")).json()["event_id"]
    assert (await client.delete(f"{EVENTS}/{event_id}", headers=auth("marco"))).status_code == 403
    assert (await client.delete(f"{EVENTS}/{event_id}", headers=auth("anna"))).status_code == 200
    assert await events(client, "marco") == []


async def test_three_reports_hide_an_event_and_blocked_authors_are_hidden(client, app_db):
    await people(app_db, "anna", "a", "b", "c", "d")
    await app_db.favors.insert_many([open_favor(f"f{u}", u) for u in ("anna", "a", "b", "c", "d")])
    event_id = (await create_event(client, "anna")).json()["event_id"]
    for user in ("a", "b", "c"):
        assert (await client.post(f"{EVENTS}/{event_id}/report", json={}, headers=auth(user))).status_code == 200
    assert await events(client, "d") == []


async def test_blocked_author_events_are_not_listed(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    await create_event(client, "anna")
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "marco", "blocked_id": "anna", "created_at": datetime.now(timezone.utc)})
    assert await events(client, "marco") == []


async def test_account_on_hold_cannot_create_events(client, app_db):
    await app_db.users.insert_one(make_user("me", safety_hold=True))
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await create_event(client, "me")).status_code == 403


# ---------- presentazioni dei nuovi vicini ----------

async def intro(client, user, text="Ciao, sono Marco, mi sono trasferito da poco e amo il mare."):
    return await client.put(INTRO, json={"text": text}, headers=auth(user))


async def intros(client, user):
    response = await client.get(INTROS, headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()["intros"]


async def with_position(app_db, name, km=0.0):
    await app_db.users.insert_one(make_user(name, email_verified=True, approximate_latitude=km_north(km), approximate_longitude=LON))


async def test_new_neighbor_can_introduce_themself_without_a_favor(client, app_db):
    await with_position(app_db, "marco")
    assert (await intro(client, "marco")).status_code == 200


async def test_intro_needs_a_position(client, app_db):
    await people(app_db, "marco")
    assert (await intro(client, "marco")).status_code == 403


async def test_intro_is_seen_within_30_km_and_replaced_not_duplicated(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "near", 10)
    await with_position(app_db, "far", 60)
    await intro(client, "marco")
    await intro(client, "marco", "Nuovo testo: faccio anche piccoli lavori di casa.")

    seen = await intros(client, "near")
    assert [i["text"] for i in seen] == ["Nuovo testo: faccio anche piccoli lavori di casa."]
    assert await intros(client, "far") == []
    assert seen[0]["author_name"] == "marco" and "latitude" not in seen[0]


@pytest.mark.parametrize("text", ["", "a" * 201, "Chiamami al 345 000 1234", "Scrivimi su WhatsApp", "Vendo su https://esempio.it", "Sei uno stronzo"])
async def test_unsafe_intros_are_refused(client, app_db, text):
    await with_position(app_db, "marco")
    assert (await intro(client, "marco", text)).status_code == 400


async def test_welcome_toggles_and_counts(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await with_position(app_db, "luca", 2)
    await intro(client, "marco")
    intro_id = (await intros(client, "anna"))[0]["intro_id"]

    assert (await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))).json()["welcomed"] is True
    await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("luca"))
    seen = (await intros(client, "anna"))[0]
    assert seen["welcomes"] == 2 and seen["welcomed"] is True

    assert (await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))).json()["welcomed"] is False


async def welcome_notifications(app_db, user_id):
    return await app_db.notifications.find({"user_id": user_id, "type": "welcome"}).to_list(10)


async def test_welcome_notifies_the_new_neighbor_once_a_day_and_groups_names(client, app_db):
    await with_position(app_db, "marco")
    for name in ("anna", "luca", "rosa"):
        await with_position(app_db, name, 2)
    await intro(client, "marco")
    intro_id = (await intros(client, "anna"))[0]["intro_id"]

    await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))
    first = await welcome_notifications(app_db, "marco")
    assert len(first) == 1 and "anna ti ha dato il benvenuto" in first[0]["message"]
    assert first[0]["read"] is False and first[0]["related_id"] == intro_id

    await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("luca"))
    await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("rosa"))
    grouped = await welcome_notifications(app_db, "marco")
    assert len(grouped) == 1  # una sola notifica al giorno, non una per persona
    assert "e altri 2" in grouped[0]["message"]


async def test_toggling_a_welcome_does_not_notify_twice_for_the_same_person(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await intro(client, "marco")
    intro_id = (await intros(client, "anna"))[0]["intro_id"]

    for _ in range(3):  # benvenuto, tolto, di nuovo dato
        await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))

    notes = await welcome_notifications(app_db, "marco")
    assert len(notes) == 1 and notes[0]["welcome_count"] == 1


async def test_removing_a_welcome_sends_no_notification(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await intro(client, "marco")
    intro_id = (await intros(client, "anna"))[0]["intro_id"]
    await app_db.neighborhood_intros.update_one({"intro_id": intro_id}, {"$set": {"welcomed_by": ["anna"]}})

    removed = await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))

    assert removed.json()["welcomed"] is False
    assert await welcome_notifications(app_db, "marco") == []


async def test_a_welcome_from_someone_the_author_blocked_is_silent(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await intro(client, "marco")
    intro_id = (await intros(client, "anna"))[0]["intro_id"]
    # il blocco arriva dopo: Anna conosce ancora l'indirizzo della presentazione
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "marco", "blocked_id": "anna",
                                           "created_at": datetime.now(timezone.utc)})

    await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("anna"))

    assert await welcome_notifications(app_db, "marco") == []


async def test_cannot_welcome_yourself(client, app_db):
    await with_position(app_db, "marco")
    await intro(client, "marco")
    intro_id = (await intros(client, "marco"))[0]["intro_id"]
    assert (await client.post(f"{INTROS}/{intro_id}/welcome", headers=auth("marco"))).status_code == 400


async def test_old_intros_expire_after_14_days(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await intro(client, "marco")
    await app_db.neighborhood_intros.update_one({}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(days=15)}})
    assert await intros(client, "anna") == []


async def test_author_can_withdraw_the_intro(client, app_db):
    await with_position(app_db, "marco")
    await with_position(app_db, "anna", 2)
    await intro(client, "marco")
    assert (await client.delete(INTRO, headers=auth("marco"))).status_code == 200
    assert await intros(client, "anna") == []


async def test_three_reports_hide_an_intro(client, app_db):
    for name in ("marco", "a", "b", "c", "d"):
        await with_position(app_db, name, 1)
    await intro(client, "marco")
    intro_id = (await intros(client, "d"))[0]["intro_id"]
    for user in ("a", "b", "c"):
        assert (await client.post(f"{INTROS}/{intro_id}/report", json={}, headers=auth(user))).status_code == 200
    assert await intros(client, "d") == []


async def test_deleting_the_account_removes_events_intros_and_attendance(client, app_db):
    await people(app_db, "anna", "marco")
    await with_position(app_db, "luca")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    event_id = (await create_event(client, "anna")).json()["event_id"]
    await client.post(f"{EVENTS}/{event_id}/join", headers=auth("marco"))
    await intro(client, "luca")
    from routers import neighborhood_social_routes as social
    await social.delete_user_social_data("anna")
    await social.delete_user_social_data("marco")
    await social.delete_user_social_data("luca")
    assert await app_db.neighborhood_events.count_documents({}) == 0
    assert await app_db.neighborhood_intros.count_documents({}) == 0
