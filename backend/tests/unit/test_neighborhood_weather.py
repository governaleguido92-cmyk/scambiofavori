"""Meteo del quartiere: dalla posizione approssimata dei favori, con cache condivisa e senza coordinate verso l'esterno."""
from datetime import datetime, timedelta, timezone

import pytest

import weather
from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300

RAW = {
    "current": {"temperature_2m": 18.34, "apparent_temperature": 17.9, "weather_code": 2, "wind_speed_10m": 12.4},
    "daily": {
        "time": ["2026-11-05", "2026-11-06", "2026-11-07"],
        "weather_code": [2, 61, 0],
        "temperature_2m_max": [20.2, 17.1, 19.0],
        "temperature_2m_min": [13.4, 12.0, 11.8],
        "precipitation_probability_max": [10, 80, 0],
    },
}


@pytest.fixture(autouse=True)
def clean_cache():
    weather.clear_cache()
    yield
    weather.clear_cache()


def test_weather_codes_are_described_in_italian():
    assert weather.describe(0) == ("Sereno", "sunny")
    assert weather.describe(2)[0] == "Parzialmente nuvoloso"
    assert weather.describe(61) == ("Pioggia", "rainy")
    assert weather.describe(95) == ("Temporale", "thunder")
    assert weather.describe(999)[0] == "Variabile"  # codice sconosciuto: mai un errore


def test_parse_keeps_only_what_the_app_shows():
    parsed = weather.parse_forecast(RAW)
    assert parsed["temperature"] == 18
    assert parsed["description"] == "Parzialmente nuvoloso"
    assert {key: parsed["today"][key] for key in ("min", "max", "rain_chance")} == {"min": 13, "max": 20, "rain_chance": 10}
    assert parsed["today"]["description"] == "Parzialmente nuvoloso"
    assert parsed["tomorrow"]["description"] == "Pioggia" and parsed["tomorrow"]["rain_chance"] == 80
    assert parsed["source"] == "Open-Meteo"


async def test_provider_receives_rounded_coordinates_only():
    calls = []

    async def fake_fetch(lat, lon):
        calls.append((lat, lon))
        return RAW

    await weather.get_weather(37.93149, 12.33051, fetch=fake_fetch)

    assert calls == [(37.9, 12.3)]  # celle di circa 10 km: mai la posizione precisa


async def test_same_area_is_fetched_once_and_cached():
    calls = []

    async def fake_fetch(lat, lon):
        calls.append(1)
        return RAW

    await weather.get_weather(37.93, 12.33, fetch=fake_fetch)
    await weather.get_weather(37.91, 12.34, fetch=fake_fetch)  # stessa cella da 0,1 gradi
    await weather.get_weather(38.50, 12.33, fetch=fake_fetch)  # un'altra zona

    assert len(calls) == 2


async def test_cache_expires_after_thirty_minutes(monkeypatch):
    calls = []
    clock = {"now": 1000.0}

    async def fake_fetch(lat, lon):
        calls.append(1)
        return RAW

    monkeypatch.setattr(weather, "_now", lambda: clock["now"])
    await weather.get_weather(37.93, 12.33, fetch=fake_fetch)
    clock["now"] += 29 * 60
    await weather.get_weather(37.93, 12.33, fetch=fake_fetch)
    clock["now"] += 2 * 60
    await weather.get_weather(37.93, 12.33, fetch=fake_fetch)

    assert len(calls) == 2


async def test_failure_is_not_cached_and_raises_unavailable():
    async def failing(lat, lon):
        raise weather.WeatherUnavailable("boom")

    with pytest.raises(weather.WeatherUnavailable):
        await weather.get_weather(37.93, 12.33, fetch=failing)

    async def working(lat, lon):
        return RAW

    assert (await weather.get_weather(37.93, 12.33, fetch=working))["temperature"] == 18


# ---------- rotta ----------

def open_favor(user: str) -> dict:
    return make_favor("f1", creator_id=user, creator_name=user, status="active", accepted_by=None, accepted_by_name=None,
                      approximate_latitude=LAT, approximate_longitude=LON,
                      expires_at=datetime.now(timezone.utc) + timedelta(days=3))


async def test_route_needs_login(client):
    assert (await client.get("/api/neighborhood/weather")).status_code == 401


async def test_route_uses_the_position_of_the_users_open_favor(client, app_db, monkeypatch):
    seen = []

    async def fake_fetch(lat, lon):
        seen.append((lat, lon))
        return RAW

    monkeypatch.setattr(weather, "fetch_forecast", fake_fetch)
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(open_favor("me"))

    response = await client.get("/api/neighborhood/weather", headers=auth("me"))

    assert response.status_code == 200
    body = response.json()
    assert body["weather"]["description"] == "Parzialmente nuvoloso"
    assert seen == [(37.9, 12.3)]
    assert "latitude" not in str(body) and "37.9" not in str(body["weather"])


async def test_route_falls_back_to_the_profile_position(client, app_db, monkeypatch):
    async def fake_fetch(lat, lon):
        return RAW

    monkeypatch.setattr(weather, "fetch_forecast", fake_fetch)
    await app_db.users.insert_one(make_user("me", approximate_latitude=LAT, approximate_longitude=LON))

    assert (await client.get("/api/neighborhood/weather", headers=auth("me"))).json()["weather"] is not None


async def test_route_without_any_position_says_so(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    body = (await client.get("/api/neighborhood/weather", headers=auth("me"))).json()
    assert body == {"weather": None, "reason": "no_position"}


async def test_route_survives_a_provider_failure(client, app_db, monkeypatch):
    async def failing(lat, lon):
        raise weather.WeatherUnavailable("down")

    monkeypatch.setattr(weather, "fetch_forecast", failing)
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(open_favor("me"))

    response = await client.get("/api/neighborhood/weather", headers=auth("me"))

    assert response.status_code == 200
    assert response.json() == {"weather": None, "reason": "unavailable"}
