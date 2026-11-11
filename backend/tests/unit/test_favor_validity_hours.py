"""Scadenza dell'annuncio in ore: da 1 ora a 5 giorni (120 ore). Le app vecchie mandano ancora i giorni."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user
from test_trust_safety import FAVOR_BODY

TOLERANCE = timedelta(minutes=1)


def hours_left(stored: dict) -> timedelta:
    return stored["expires_at"].replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)


async def create(client, app_db, **body):
    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))
    response = await client.post("/api/favors", json={**FAVOR_BODY, **body}, headers=auth("me"))
    assert response.status_code == 200, response.text
    return response.json(), await app_db.favors.find_one({"favor_id": response.json()["favor_id"]})


async def test_a_favor_can_expire_after_one_hour(client, app_db):
    body, stored = await create(client, app_db, validity_hours=1)

    assert stored["validity_hours"] == 1
    assert timedelta(hours=1) - TOLERANCE < hours_left(stored) <= timedelta(hours=1)
    assert body["validity_hours"] == 1


async def test_hours_win_over_days_when_both_are_sent(client, app_db):
    _, stored = await create(client, app_db, validity_hours=6, validity_days=3)

    assert stored["validity_hours"] == 6
    assert timedelta(hours=6) - TOLERANCE < hours_left(stored) <= timedelta(hours=6)


async def test_hours_are_kept_between_one_hour_and_five_days(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))

    for wrong in (0, -3, 121, 1.5):
        response = await client.post("/api/favors", json={**FAVOR_BODY, "validity_hours": wrong}, headers=auth("me"))
        assert response.status_code == 422, (wrong, response.text)


async def test_old_apps_sending_days_still_work(client, app_db):
    _, stored = await create(client, app_db, validity_days=3)

    assert stored["validity_hours"] == 72
    assert stored["validity_days"] == 3
    assert timedelta(days=3) - TOLERANCE < hours_left(stored) <= timedelta(days=3)


async def test_short_listings_keep_validity_days_for_old_apps(client, app_db):
    _, stored = await create(client, app_db, validity_hours=6)

    # le app vecchie leggono validity_days: un annuncio di poche ore conta come 1 giorno
    assert stored["validity_days"] == 1


async def test_editing_the_hours_restarts_the_expiry_from_now(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("other")])
    await app_db.favors.insert_one(make_favor(
        status="active", type="offer", accepted_by=None, accepted_by_name=None, title="Aiuto con la spesa",
        description="Porto la spesa a casa", category="Spesa", duration_hours=1.0, granelli_cost=1, validity_days=3,
        expires_at=datetime.now(timezone.utc) + timedelta(days=3)))

    response = await client.put("/api/favors/favor_1", json={"validity_hours": 12}, headers=auth("creator"))

    assert response.status_code == 200, response.text
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["validity_hours"] == 12
    assert stored["validity_days"] == 1
    assert timedelta(hours=12) - TOLERANCE < hours_left(stored) <= timedelta(hours=12)


async def test_editing_rejects_hours_out_of_range(client, app_db):
    await app_db.users.insert_many([make_user("creator")])
    await app_db.favors.insert_one(make_favor(status="active", type="offer", accepted_by=None, creator_id="creator"))

    response = await client.put("/api/favors/favor_1", json={"validity_hours": 200}, headers=auth("creator"))

    assert response.status_code == 422


# ---------- promemoria di scadenza per gli annunci brevi ----------

def short_favor(favor_id: str, validity_hours: int, left: timedelta) -> dict:
    return make_favor(favor_id, creator_id="owner", creator_name="owner", status="active", accepted_by=None,
                      accepted_by_name=None, approximate_latitude=37.9, approximate_longitude=12.3,
                      validity_hours=validity_hours, validity_days=1, expires_at=datetime.now(timezone.utc) + left)


async def expiry_reminders(client) -> list:
    response = await client.get("/api/notifications", headers=auth("owner"))
    assert response.status_code == 200, response.text
    return [n for n in response.json() if n["type"] == "favor_expiring"]


async def test_a_six_hour_listing_is_not_reminded_right_after_publishing(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    await app_db.favors.insert_one(short_favor("f1", 6, timedelta(hours=5, minutes=50)))

    assert await expiry_reminders(client) == []


async def test_a_six_hour_listing_is_reminded_near_the_end(client, app_db):
    await app_db.users.insert_one(make_user("owner", email_verified=True))
    await app_db.favors.insert_one(short_favor("f1", 6, timedelta(hours=1)))

    reminders = await expiry_reminders(client)

    assert len(reminders) == 1
    assert "24 ore" not in reminders[0]["message"]
