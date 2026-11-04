"""Quartiere: chat tra chi ha un favore attivo entro 30 km, messaggi che durano 2 giorni."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300
URL = "/api/area-chat"


def km_north(km: float) -> float:
    return LAT + km / 111.0


def open_favor(favor_id: str, user: str, km: float = 0.0, **extra) -> dict:
    fields = {"creator_id": user, "creator_name": user, "status": "active", "accepted_by": None, "accepted_by_name": None,
              "approximate_latitude": km_north(km), "approximate_longitude": LON,
              "expires_at": datetime.now(timezone.utc) + timedelta(days=3), **extra}
    return make_favor(favor_id, **fields)


async def people(app_db, *names):
    await app_db.users.insert_many([make_user(n) for n in names])


async def say(client, user: str, text: str):
    return await client.post(URL, json={"content": text}, headers=auth(user))


async def read(client, user: str):
    response = await client.get(URL, headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()["messages"]


# ---------- chi può entrare ----------

async def test_user_without_an_open_favor_cannot_read_or_write(client, app_db):
    await people(app_db, "me")
    assert (await say(client, "me", "Ciao a tutti")).status_code == 403
    assert (await client.get(URL, headers=auth("me"))).status_code == 403


async def test_completed_favor_does_not_give_access(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me", status="completed"))
    assert (await say(client, "me", "Ciao a tutti")).status_code == 403


async def test_helper_with_an_accepted_favor_can_enter(client, app_db):
    await people(app_db, "creator", "helper")
    await app_db.favors.insert_one(make_favor("f1", status="accepted", approximate_latitude=LAT, approximate_longitude=LON,
                                              expires_at=datetime.now(timezone.utc) + timedelta(days=1)))
    assert (await say(client, "helper", "Arrivo tra poco")).status_code == 200


async def test_account_on_hold_cannot_write(client, app_db):
    await app_db.users.insert_one(make_user("me", safety_hold=True))
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await say(client, "me", "Ciao a tutti")).status_code == 403


# ---------- raggio di 30 km ----------

async def test_people_within_30_km_see_each_other(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco", km=20)])

    await say(client, "anna", "Qualcuno ha una scala?")
    messages = await read(client, "marco")

    assert [m["content"] for m in messages] == ["Qualcuno ha una scala?"]
    assert messages[0]["mine"] is False


async def test_people_beyond_30_km_do_not_see_each_other(client, app_db):
    await people(app_db, "anna", "luca")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f3", "luca", km=45)])

    await say(client, "anna", "Qualcuno ha una scala?")

    assert await read(client, "luca") == []


async def test_distance_is_rounded_and_coordinates_are_never_exposed(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco", km=12)])
    await say(client, "anna", "Buongiorno")

    message = (await read(client, "marco"))[0]

    assert message["distance_km"] == 10  # 12 km arrotondati ai 5 km più vicini
    assert not ({"latitude", "longitude", "lat", "lon"} & set(message))


# ---------- 2 giorni ----------

async def test_messages_older_than_two_days_disappear(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    old = datetime.now(timezone.utc) - timedelta(days=3)
    await app_db.area_messages.insert_one({
        "message_id": "m_old", "author_id": "anna", "author_name": "anna", "content": "Vecchio", "latitude": LAT,
        "longitude": LON, "created_at": old, "expires_at": old + timedelta(days=2),
    })
    await say(client, "anna", "Nuovo")

    assert [m["content"] for m in await read(client, "marco")] == ["Nuovo"]


async def test_new_messages_expire_in_two_days(client, app_db):
    await people(app_db, "anna")
    await app_db.favors.insert_one(open_favor("f1", "anna"))

    await say(client, "anna", "Ciao")

    stored = await app_db.area_messages.find_one({})
    lifetime = stored["expires_at"] - stored["created_at"]
    assert lifetime == timedelta(days=2)


# ---------- filtri ----------

async def test_unsafe_messages_are_refused(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    for text in ["Mandami il codice che ti arriva per sms", "Pago 50 euro in contanti", "Sei uno stronzo",
                 "Guarda qui https://esempio.it/offerta", "Chiamami al 345 000 1234", "Scrivimi a nome@esempio.it", ""]:
        assert (await say(client, "me", text)).status_code == 400, text
    assert await app_db.area_messages.count_documents({}) == 0


async def test_too_long_message_is_refused(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await say(client, "me", "a" * 301)).status_code == 400


@pytest.mark.parametrize("text", [
    "Scrivimi su WhatsApp che ci mettiamo d'accordo",
    "Inviami un messaggio privato su WhatsApp per coordinare",
    "Sentiamoci in privato, ti spiego",
    "Passa su Telegram",
])
async def test_invite_outside_the_app_is_blocked(client, app_db, text):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    response = await say(client, "anna", text)

    assert response.status_code == 400
    assert "chat del favore" in response.json()["detail"]
    assert await read(client, "marco") == []


async def test_rate_limit_is_six_messages_a_minute(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    codes = [(await say(client, "me", f"Messaggio {i}")).status_code for i in range(7)]
    assert codes == [200] * 6 + [429]


# ---------- blocchi e segnalazioni ----------

async def test_blocked_people_do_not_see_each_other(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "marco", "blocked_id": "anna",
                                           "created_at": datetime.now(timezone.utc)})
    await say(client, "anna", "Ciao")
    await say(client, "marco", "Salve")

    assert [m["author_id"] for m in await read(client, "marco")] == ["marco"]  # vede solo il proprio
    assert [m["author_id"] for m in await read(client, "anna")] == ["anna"]


async def test_report_hides_a_message_after_three_people(client, app_db):
    await people(app_db, "anna", "u1", "u2", "u3", "u4")
    await app_db.favors.insert_many([open_favor(f"f{n}", n) for n in ("anna", "u1", "u2", "u3", "u4")])
    await say(client, "anna", "Messaggio contestato")
    message_id = (await read(client, "u1"))[0]["message_id"]

    for reporter in ("u1", "u2"):
        assert (await client.post(f"{URL}/{message_id}/report", json={}, headers=auth(reporter))).status_code == 200
    assert len(await read(client, "u4")) == 1  # con due segnalazioni è ancora visibile
    await client.post(f"{URL}/{message_id}/report", json={}, headers=auth("u3"))

    assert await read(client, "u4") == []
    report = await app_db.general_reports.find_one({"report_type": "area_message"})
    assert report["reported_user_id"] == "anna"


async def test_cannot_report_twice_or_own_message(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    await say(client, "anna", "Ciao")
    message_id = (await read(client, "marco"))[0]["message_id"]

    assert (await client.post(f"{URL}/{message_id}/report", json={}, headers=auth("anna"))).status_code == 400
    assert (await client.post(f"{URL}/{message_id}/report", json={}, headers=auth("marco"))).status_code == 200
    assert (await client.post(f"{URL}/{message_id}/report", json={}, headers=auth("marco"))).status_code == 400


async def test_deleting_the_account_removes_the_messages(client, app_db):
    await app_db.users.insert_one(make_user("anna", email="anna@example.com"))
    await app_db.favors.insert_one(open_favor("f1", "anna"))
    await say(client, "anna", "Ciao")

    await client.request("DELETE", "/api/account", json={"confirm_email": "anna@example.com"}, headers=auth("anna"))

    assert await app_db.area_messages.count_documents({"author_id": "anna"}) == 0
