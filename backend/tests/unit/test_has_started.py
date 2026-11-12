"""Per usare l'app serve un primo passo: pubblicare o accettare un favore. Il server lo ricorda in has_started."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300


def body(**extra):
    base = {"type": "request", "title": "Aiuto con la spesa", "description": "Servono due buste portate a casa",
            "category": "Spesa", "duration_hours": 1.0, "latitude": LAT, "longitude": LON}
    return {**base, **extra}


def active_favor(favor_id: str, creator: str) -> dict:
    return make_favor(favor_id, creator_id=creator, creator_name=creator, status="active", accepted_by=None,
                      accepted_by_name=None, approximate_latitude=LAT, approximate_longitude=LON,
                      exact_latitude=LAT, exact_longitude=LON,
                      expires_at=datetime.now(timezone.utc) + timedelta(days=3))


async def me(client) -> dict:
    response = await client.get("/api/auth/me", headers=auth("me"))
    assert response.status_code == 200
    return response.json()


async def test_new_user_has_not_started(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    assert (await me(client))["has_started"] is False


async def test_publishing_a_favor_starts_the_user(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    assert (await client.post("/api/favors", json=body(), headers=auth("me"))).status_code == 200

    assert (await me(client))["has_started"] is True
    assert (await app_db.users.find_one({"user_id": "me"}))["has_started"] is True


async def test_accepting_a_favor_starts_the_user(client, app_db, mongo_like_find_one_and_update):
    await app_db.users.insert_many([make_user("me", email_verified=True), make_user("other", email_verified=True)])
    await app_db.favors.insert_one(active_favor("f1", "other"))

    response = await client.post("/api/favors/accept", json={"favor_id": "f1"}, headers=auth("me"))

    assert response.status_code == 200, response.text
    assert (await me(client))["has_started"] is True


async def test_users_with_older_favors_count_as_started(client, app_db):
    """Chi usava l'app prima di questa regola non deve trovarla chiusa."""
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(make_favor("old", creator_id="me", status="completed"))

    assert (await me(client))["has_started"] is True
    assert (await app_db.users.find_one({"user_id": "me"}))["has_started"] is True


async def test_older_accepted_favor_counts_too(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(make_favor("old", creator_id="other", accepted_by="me", status="completed"))

    assert (await me(client))["has_started"] is True


async def test_only_a_cancelled_favor_does_not_count(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(make_favor("old", creator_id="me", status="cancelled", accepted_by=None))

    assert (await me(client))["has_started"] is False


async def test_once_started_cancelling_does_not_close_the_app_again(client, app_db):
    await app_db.users.insert_one(make_user("me", has_started=True))
    assert (await me(client))["has_started"] is True
