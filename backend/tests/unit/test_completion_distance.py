"""Conferma del favore: chi conferma deve essere entro 30 metri dal punto del favore (con la tolleranza del GPS)."""
from conftest import auth, make_favor, make_user

LAT, LON = 37.9300, 12.3300
URL = "/api/favors/complete"


def at_meters_north(meters: float) -> float:
    return LAT + meters / 111_000


async def setup(app_db):
    await app_db.users.insert_many([make_user("creator", granelli=10), make_user("helper", granelli=0)])
    await app_db.favors.insert_one(make_favor(exact_latitude=LAT, exact_longitude=LON))


async def confirm(client, meters=None, accuracy=None):
    body = {"favor_id": "favor_1"}
    if meters is not None:
        body.update({"latitude": at_meters_north(meters), "longitude": LON})
    if accuracy is not None:
        body["accuracy_meters"] = accuracy
    return await client.post(URL, json=body, headers=auth("creator"))


async def test_close_enough_completes_the_favor(client, app_db):
    await setup(app_db)
    response = await confirm(client, meters=20)
    assert response.status_code == 200
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "completed"


async def test_too_far_is_refused_and_nothing_moves(client, app_db):
    await setup(app_db)

    response = await confirm(client, meters=45)

    assert response.status_code == 400
    assert "30 m" in response.json()["detail"]
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "accepted"
    assert (await app_db.users.find_one({"user_id": "creator"}))["granelli"] == 10


async def test_gps_accuracy_widens_the_limit(client, app_db):
    await setup(app_db)
    # 45 m di distanza, ma il telefono dichiara di poter sbagliare di 20 m: 30 + 20 = 50 m
    response = await confirm(client, meters=45, accuracy=20)
    assert response.status_code == 200


async def test_accuracy_tolerance_is_capped(client, app_db):
    await setup(app_db)
    # un telefono che dichiara 500 m di incertezza non può far passare una conferma a 100 m
    response = await confirm(client, meters=100, accuracy=500)
    assert response.status_code == 400


async def test_no_position_keeps_the_old_behavior(client, app_db):
    """Senza GPS (permesso negato, versioni vecchie dell'app) la conferma passa come prima."""
    await setup(app_db)
    response = await confirm(client)
    assert response.status_code == 200


async def test_security_log_keeps_the_distance_but_never_the_coordinates(client, app_db):
    await setup(app_db)

    await confirm(client, meters=20)

    log = await app_db.security_logs.find_one({"favor_id": "favor_1"})
    assert log["distance_m"] is not None and 15 <= log["distance_m"] <= 25
    assert log["gps_latitude"] is None and log["gps_longitude"] is None
