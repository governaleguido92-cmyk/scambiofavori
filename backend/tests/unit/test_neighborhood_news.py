"""Avvisi del quartiere: li pubblica chi ha un favore attivo, durano 3 giorni, entro 30 km."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300
NEWS = "/api/neighborhood/news"
NOTICES = "/api/neighborhood/notices"


def km_north(km: float) -> float:
    return LAT + km / 111.0


def open_favor(favor_id: str, user: str, km: float = 0.0) -> dict:
    return make_favor(favor_id, creator_id=user, creator_name=user, status="active", accepted_by=None, accepted_by_name=None,
                      approximate_latitude=km_north(km), approximate_longitude=LON,
                      expires_at=datetime.now(timezone.utc) + timedelta(days=3))


async def people(app_db, *names):
    await app_db.users.insert_many([make_user(n, email_verified=True) for n in names])


async def publish(client, user, text="Strada chiusa per lavori in via Roma", category="lavori"):
    return await client.post(NOTICES, json={"category": category, "text": text}, headers=auth(user))


async def news(client, user):
    response = await client.get(NEWS, headers=auth(user))
    assert response.status_code == 200, response.text
    return response.json()


async def test_posting_needs_an_active_favor(client, app_db):
    await people(app_db, "me")
    assert (await publish(client, "me")).status_code == 403


async def test_notice_is_seen_within_30_km_and_not_beyond(client, app_db):
    await people(app_db, "anna", "vicino", "lontano")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "vicino", km=20), open_favor("f3", "lontano", km=45)])

    assert (await publish(client, "anna")).status_code == 200

    assert [n["text"] for n in (await news(client, "vicino"))["notices"]] == ["Strada chiusa per lavori in via Roma"]
    assert (await news(client, "lontano"))["notices"] == []


async def test_reading_works_with_the_profile_position_even_without_a_favor(client, app_db):
    await app_db.users.insert_many([make_user("anna"), make_user("lettore", approximate_latitude=LAT, approximate_longitude=LON)])
    await app_db.favors.insert_one(open_favor("f1", "anna"))
    await publish(client, "anna")

    assert len((await news(client, "lettore"))["notices"]) == 1


async def test_without_any_position_nothing_is_shown(client, app_db):
    await people(app_db, "me")
    assert await news(client, "me") == {"notices": [], "reason": "no_position"}


async def test_notices_expire_after_three_days(client, app_db):
    await people(app_db, "anna")
    await app_db.favors.insert_one(open_favor("f1", "anna"))
    await publish(client, "anna")

    stored = await app_db.neighborhood_notices.find_one({})
    assert stored["expires_at"] - stored["created_at"] == timedelta(days=3)

    old = datetime.now(timezone.utc) - timedelta(days=4)
    await app_db.neighborhood_notices.update_one({}, {"$set": {"created_at": old, "expires_at": old + timedelta(days=3)}})
    assert (await news(client, "anna"))["notices"] == []


@pytest.mark.parametrize("text", ["Mandami il codice che ti arriva per sms", "Chiamami al 345 000 1234", "Sei uno stronzo",
                                  "Offerta su https://esempio.it/sconti", "Scrivimi su WhatsApp", "Pago 50 euro", ""])
async def test_unsafe_notices_are_refused(client, app_db, text):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await publish(client, "me", text=text)).status_code == 400


async def test_wrong_category_or_too_long_text_is_refused(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    assert (await publish(client, "me", category="inventata")).status_code == 400
    assert (await publish(client, "me", text="a" * 201)).status_code == 400


async def test_three_notices_a_day_at_most(client, app_db):
    await people(app_db, "me")
    await app_db.favors.insert_one(open_favor("f1", "me"))
    codes = [(await publish(client, "me", text=f"Avviso numero {i}")).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]


async def test_author_can_delete_but_others_cannot(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    notice_id = (await publish(client, "anna")).json()["notice_id"]

    assert (await client.delete(f"{NOTICES}/{notice_id}", headers=auth("marco"))).status_code == 403
    assert (await client.delete(f"{NOTICES}/{notice_id}", headers=auth("anna"))).status_code == 200
    assert (await news(client, "marco"))["notices"] == []


async def test_three_reports_hide_a_notice(client, app_db):
    await people(app_db, "anna", "u1", "u2", "u3", "u4")
    await app_db.favors.insert_many([open_favor(f"f{n}", n) for n in ("anna", "u1", "u2", "u3", "u4")])
    notice_id = (await publish(client, "anna")).json()["notice_id"]

    for reporter in ("u1", "u2"):
        assert (await client.post(f"{NOTICES}/{notice_id}/report", json={}, headers=auth(reporter))).status_code == 200
    assert len((await news(client, "u4"))["notices"]) == 1
    await client.post(f"{NOTICES}/{notice_id}/report", json={}, headers=auth("u3"))

    assert (await news(client, "u4"))["notices"] == []
    assert (await client.post(f"{NOTICES}/{notice_id}/report", json={}, headers=auth("u1"))).status_code == 400  # già segnalato


async def test_blocked_authors_are_hidden(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco")])
    await publish(client, "anna")
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "marco", "blocked_id": "anna", "created_at": datetime.now(timezone.utc)})

    assert (await news(client, "marco"))["notices"] == []


async def test_account_on_hold_cannot_publish_and_deleting_the_account_removes_notices(client, app_db):
    await app_db.users.insert_many([make_user("bad", safety_hold=True), make_user("anna", email="anna@example.com")])
    await app_db.favors.insert_many([open_favor("f1", "bad"), open_favor("f2", "anna")])
    assert (await publish(client, "bad")).status_code == 403

    await publish(client, "anna")
    await client.request("DELETE", "/api/account", json={"confirm_email": "anna@example.com"}, headers=auth("anna"))
    assert await app_db.neighborhood_notices.count_documents({"author_id": "anna"}) == 0


async def test_notice_never_exposes_coordinates(client, app_db):
    await people(app_db, "anna", "marco")
    await app_db.favors.insert_many([open_favor("f1", "anna"), open_favor("f2", "marco", km=12)])
    await publish(client, "anna")

    notice = (await news(client, "marco"))["notices"][0]

    assert notice["distance_km"] == 10
    assert not ({"latitude", "longitude", "lat", "lon"} & set(notice))
