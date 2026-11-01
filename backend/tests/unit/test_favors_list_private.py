"""L'elenco dei favori richiede il login: niente lettura anonima."""
from conftest import auth, make_favor, make_user


async def test_favors_list_requires_login(client, app_db):
    await app_db.favors.insert_one(make_favor(status="active"))

    response = await client.get("/api/favors")

    assert response.status_code == 401


async def test_favors_list_with_invalid_token_is_rejected(client, app_db):
    response = await client.get("/api/favors", headers={"Authorization": "Bearer finto"})

    assert response.status_code == 401


async def test_favors_list_works_when_logged_in(client, app_db):
    await app_db.users.insert_one(make_user("viewer"))
    await app_db.favors.insert_one(make_favor(status="active"))

    response = await client.get("/api/favors", headers=auth("viewer"))

    assert response.status_code == 200
    assert [f["favor_id"] for f in response.json()] == ["favor_1"]


async def test_single_favor_requires_login(client, app_db):
    await app_db.favors.insert_one(make_favor(status="active"))

    response = await client.get("/api/favors/favor_1")

    assert response.status_code == 401


async def test_single_favor_hides_exact_position_from_others(client, app_db):
    await app_db.users.insert_one(make_user("viewer"))
    await app_db.favors.insert_one(
        make_favor(status="active", exact_latitude=37.9, exact_longitude=12.3)
    )

    response = await client.get("/api/favors/favor_1", headers=auth("viewer"))

    assert response.status_code == 200
    assert response.json()["exact_latitude"] is None
    assert response.json()["exact_longitude"] is None


async def test_single_favor_shows_exact_position_to_creator(client, app_db):
    await app_db.users.insert_one(make_user("creator"))
    await app_db.favors.insert_one(
        make_favor(status="active", exact_latitude=37.9, exact_longitude=12.3)
    )

    response = await client.get("/api/favors/favor_1", headers=auth("creator"))

    assert response.status_code == 200
    assert response.json()["exact_latitude"] == 37.9
