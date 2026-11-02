"""Chi crea un favore lo vede esattamente dove si trova; gli altri vedono solo la posizione approssimata."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user

EXACT = (37.9300, 12.3200)
BLURRED = (37.9312, 12.3221)


def _favor(favor_id: str = "f1", creator: str = "me") -> dict:
    return make_favor(
        favor_id,
        creator_id=creator,
        creator_name=creator,
        status="active",
        accepted_by=None,
        accepted_by_name=None,
        exact_latitude=EXACT[0],
        exact_longitude=EXACT[1],
        approximate_latitude=BLURRED[0],
        approximate_longitude=BLURRED[1],
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
    )


async def test_creator_sees_own_favor_at_exact_position(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(_favor())

    response = await client.get("/api/favors", headers=auth("me"))

    favor = response.json()[0]
    assert (favor["approximate_latitude"], favor["approximate_longitude"]) == EXACT


async def test_distance_of_own_favor_is_zero_from_the_same_place(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(_favor())

    response = await client.get(
        "/api/favors", params={"latitude": EXACT[0], "longitude": EXACT[1]}, headers=auth("me")
    )

    assert response.json()[0]["distance_km"] == 0


async def test_other_users_still_see_the_blurred_position_only(client, app_db):
    await app_db.users.insert_many([make_user("me"), make_user("other")])
    await app_db.favors.insert_one(_favor())

    response = await client.get("/api/favors", headers=auth("other"))

    favor = response.json()[0]
    assert (favor["approximate_latitude"], favor["approximate_longitude"]) == BLURRED
    assert favor["exact_latitude"] is None
    assert favor["exact_longitude"] is None


async def test_exact_coordinates_are_not_exposed_in_the_list_even_to_the_creator(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(_favor())

    response = await client.get("/api/favors", headers=auth("me"))

    favor = response.json()[0]
    assert favor["exact_latitude"] is None
    assert favor["exact_longitude"] is None
