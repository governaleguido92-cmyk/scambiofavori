"""Un favore si completa solo con il codice QR: chi lo riceve lo mostra, chi lo esegue lo scansiona."""
import pytest

from conftest import auth, make_favor, make_user

QR = "secretqrtoken123"


async def seed(app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor(qr_code=QR))


async def test_manual_completion_is_refused(client, app_db):
    await seed(app_db)
    response = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("creator"))
    assert response.status_code == 400
    assert "QR" in response.json()["detail"]
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "accepted"


async def test_helper_cannot_complete_manually_either(client, app_db):
    await seed(app_db)
    response = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("helper"))
    assert response.status_code == 400


async def test_qr_scan_completes_and_moves_granelli(client, app_db):
    await seed(app_db)
    response = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": QR}, headers=auth("helper"))
    assert response.status_code == 200, response.text
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "completed"
    assert (await app_db.users.find_one({"user_id": "helper"}))["granelli"] > 10


async def test_wrong_qr_does_not_complete(client, app_db):
    await seed(app_db)
    response = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": "sbagliato"}, headers=auth("helper"))
    assert response.status_code == 400
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "accepted"
