"""Età all'iscrizione: si chiede la data di nascita, serve essere maggiorenni e si conserva solo l'anno."""
from datetime import date, timedelta

import pytest

from age import MIN_AGE, age_on, parse_birth_date


def born(years: int, extra_days: int = 0) -> str:
    today = date.today()
    return (date(today.year - years, today.month, min(today.day, 28)) - timedelta(days=extra_days)).isoformat()


def register_body(birth_date=None, email="age@example.com"):
    body = {"email": email, "name": "Mario Rossi", "password": "password-lunga-123"}
    if birth_date is not None:
        body["birth_date"] = birth_date
    return body


def test_age_counts_full_years_only():
    assert age_on(date(2000, 6, 15), date(2018, 6, 14)) == 17
    assert age_on(date(2000, 6, 15), date(2018, 6, 15)) == 18


@pytest.mark.parametrize("text", ["2000-02-30", "ieri", "", "15/06/2000", "2000-13-01"])
def test_invalid_dates_are_refused(text):
    with pytest.raises(ValueError):
        parse_birth_date(text)


async def test_adult_registers_and_only_the_birth_year_is_stored(client, app_db):
    response = await client.post("/api/auth/register", json=register_body("1980-05-20"))

    assert response.status_code == 200, response.text
    stored = await app_db.users.find_one({"email": "age@example.com"})
    assert stored["birth_year"] == 1980
    assert "birth_date" not in stored


async def test_minor_cannot_register_and_nothing_is_saved(client, app_db):
    response = await client.post("/api/auth/register", json=register_body(born(MIN_AGE - 1)))

    assert response.status_code == 400
    assert "18" in response.json()["detail"]
    assert await app_db.users.count_documents({}) == 0


async def test_eighteenth_birthday_is_the_first_allowed_day(client, app_db):
    today = date.today()
    try:
        exactly_18 = date(today.year - MIN_AGE, today.month, today.day)
    except ValueError:  # 29 febbraio in un anno non bisestile
        exactly_18 = date(today.year - MIN_AGE, 2, 28)
    too_young = exactly_18 + timedelta(days=1)

    ok = await client.post("/api/auth/register", json=register_body(exactly_18.isoformat(), "a@example.com"))
    no = await client.post("/api/auth/register", json=register_body(too_young.isoformat(), "b@example.com"))

    assert ok.status_code == 200
    assert no.status_code == 400


@pytest.mark.parametrize("text", ["2999-01-01", "1800-01-01", "non una data"])
async def test_impossible_birth_dates_are_refused(client, text):
    response = await client.post("/api/auth/register", json=register_body(text))
    assert response.status_code == 400


async def test_older_app_versions_without_birth_date_can_still_register(client, app_db):
    response = await client.post("/api/auth/register", json=register_body())
    assert response.status_code == 200
