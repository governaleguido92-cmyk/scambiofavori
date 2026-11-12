"""Nome del paese nel Quartiere: dalla posizione approssimata, con copia condivisa e senza posizioni precise all'esterno."""
from datetime import datetime, timedelta, timezone

import pytest

import locality
from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300


def street(city="Favignana", field="village"):
    return {"name": city, "addresstype": field, "address": {field: city, "county": "Trapani", "country": "Italia"}}


def place(name, value="village"):
    return {"name": name, "addresstype": value, "address": {"county": "Trapani"}}


@pytest.fixture(autouse=True)
def clean_cache():
    locality.clear_cache()
    yield
    locality.clear_cache()


def test_city_comes_from_the_address():
    assert locality.city_from_response(street("Petrosino")) == "Petrosino"
    assert locality.city_from_response(street("Trapani", field="city")) == "Trapani"
    assert locality.city_from_response(street("Marsala", field="town")) == "Marsala"


def test_point_on_a_village_uses_its_name():
    assert locality.city_from_response(place("Marettimo")) == "Marettimo"


def test_nameless_places_give_nothing():
    assert locality.city_from_response({"error": "Unable to geocode"}) is None  # in mare aperto
    assert locality.city_from_response(place("Bosco", value="locality")) is None


def test_unexpected_response_is_unavailable():
    with pytest.raises(locality.LocalityUnavailable):
        locality.city_from_response(["non", "un", "oggetto"])


def test_long_or_messy_names_are_cleaned():
    assert locality.city_from_response(street("  Mazara   del Vallo ")) == "Mazara del Vallo"
    assert len(locality.city_from_response(street("x" * 200))) == locality.MAX_NAME_LENGTH


async def test_provider_receives_rounded_coordinates_only():
    calls = []

    async def fake_fetch(lat, lon):
        calls.append((lat, lon))
        return street()

    await locality.get_city(37.93149, 12.33051, fetch=fake_fetch)

    assert calls == [(37.93, 12.33)]  # celle di circa 1 km: mai la posizione precisa


async def test_same_cell_is_fetched_once():
    calls = []

    async def fake_fetch(lat, lon):
        calls.append(1)
        return street()

    assert await locality.get_city(37.931, 12.331, fetch=fake_fetch) == "Favignana"
    assert await locality.get_city(37.932, 12.329, fetch=fake_fetch) == "Favignana"
    assert len(calls) == 1


async def test_failure_is_not_cached():
    async def failing(lat, lon):
        raise locality.LocalityUnavailable("down")

    async def working(lat, lon):
        return street()

    with pytest.raises(locality.LocalityUnavailable):
        await locality.get_city(LAT, LON, fetch=failing)
    assert await locality.get_city(LAT, LON, fetch=working) == "Favignana"


# ---------- rotta ----------

def open_favor(user: str) -> dict:
    return make_favor("f1", creator_id=user, creator_name=user, status="active", accepted_by=None, accepted_by_name=None,
                      approximate_latitude=LAT, approximate_longitude=LON,
                      expires_at=datetime.now(timezone.utc) + timedelta(days=3))


def recording_fetch(monkeypatch, response=None):
    seen = []

    async def fake_fetch(lat, lon):
        seen.append((lat, lon))
        return response or street()

    monkeypatch.setattr(locality, "fetch_reverse", fake_fetch)
    return seen


async def test_route_needs_login(client):
    assert (await client.get("/api/neighborhood/city")).status_code == 401


async def test_route_uses_the_open_favor_before_the_phone(client, app_db, monkeypatch):
    seen = recording_fetch(monkeypatch)
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(open_favor("me"))

    response = await client.get("/api/neighborhood/city?latitude=45.46&longitude=9.19", headers=auth("me"))

    assert response.json() == {"city": "Favignana"}
    assert seen == [(37.93, 12.33)]


async def test_route_uses_the_phone_position_without_favors(client, app_db, monkeypatch):
    seen = recording_fetch(monkeypatch, street("Petrosino"))
    await app_db.users.insert_one(make_user("me"))

    response = await client.get("/api/neighborhood/city?latitude=37.71234&longitude=12.49876", headers=auth("me"))

    assert response.json() == {"city": "Petrosino"}
    assert seen == [(37.71, 12.5)]


async def test_route_falls_back_to_the_profile(client, app_db, monkeypatch):
    recording_fetch(monkeypatch)
    await app_db.users.insert_one(make_user("me", approximate_latitude=LAT, approximate_longitude=LON))

    assert (await client.get("/api/neighborhood/city", headers=auth("me"))).json() == {"city": "Favignana"}


async def test_route_without_any_position_says_so(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    body = (await client.get("/api/neighborhood/city", headers=auth("me"))).json()
    assert body == {"city": None, "reason": "no_position"}


async def test_route_rejects_impossible_coordinates(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    response = await client.get("/api/neighborhood/city?latitude=200&longitude=12", headers=auth("me"))
    assert response.status_code == 422


async def test_route_survives_a_provider_failure(client, app_db, monkeypatch):
    async def failing(lat, lon):
        raise locality.LocalityUnavailable("down")

    monkeypatch.setattr(locality, "fetch_reverse", failing)
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(open_favor("me"))

    response = await client.get("/api/neighborhood/city", headers=auth("me"))

    assert response.status_code == 200
    assert response.json() == {"city": None, "reason": "unavailable"}
