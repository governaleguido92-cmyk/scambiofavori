"""Granelli economy: settlement atomicity, roles, QR secrecy, debug endpoint lock-down."""
import pytest

import core
from routers import favors_routes
from conftest import auth, make_favor, make_user


async def seed(db, favor=None, creator_granelli=10, helper_granelli=10):
    await db.users.insert_one(make_user("creator", granelli=creator_granelli))
    await db.users.insert_one(make_user("helper", granelli=helper_granelli))
    await db.favors.insert_one(favor or make_favor())


async def balance(db, user_id):
    return (await db.users.find_one({"user_id": user_id}))["granelli"]


async def test_request_payer_is_creator_and_helper_is_acceptor(app_db):
    await seed(app_db)
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))

    helper_id, payer_id = await core.settle_favor(favor)

    assert (helper_id, payer_id) == ("helper", "creator")
    assert await balance(app_db, "creator") == 7
    assert await balance(app_db, "helper") == 13


async def test_offer_payer_is_acceptor(app_db):
    await seed(app_db, make_favor(type="offer"))
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))

    helper_id, payer_id = await core.settle_favor(favor)

    assert (helper_id, payer_id) == ("creator", "helper")
    assert await balance(app_db, "helper") == 7
    assert await balance(app_db, "creator") == 13


async def test_settlement_is_idempotent_second_call_conflicts(app_db):
    await seed(app_db)
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))
    await core.settle_favor(favor)

    with pytest.raises(core.HTTPException) as exc:
        await core.settle_favor(favor)

    assert exc.value.status_code == 409
    assert await balance(app_db, "creator") == 7
    assert await balance(app_db, "helper") == 13


async def test_insufficient_balance_rolls_back_and_never_goes_negative(app_db):
    await seed(app_db, creator_granelli=1)
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))

    with pytest.raises(core.HTTPException) as exc:
        await core.settle_favor(favor)

    assert exc.value.status_code == 400
    assert await balance(app_db, "creator") == 1
    assert await balance(app_db, "helper") == 10
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["status"] == "accepted"


async def test_helper_of_an_offer_cannot_self_complete(client, app_db):
    await seed(app_db, make_favor(type="offer"))

    response = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("creator"))

    assert response.status_code == 403
    assert await balance(app_db, "creator") == 10


async def test_payer_can_complete_without_qr(client, app_db):
    await seed(app_db)

    response = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("creator"))

    assert response.status_code == 200
    assert await balance(app_db, "helper") == 13


async def test_qr_image_visible_only_to_payer(client, app_db):
    await seed(app_db)

    helper_resp = await client.get("/api/favors/favor_1/qr-image", headers=auth("helper"))
    payer_resp = await client.get("/api/favors/favor_1/qr-image", headers=auth("creator"))

    assert helper_resp.status_code == 403
    assert payer_resp.status_code == 200


async def test_favor_responses_never_leak_qr_code(client, app_db):
    await seed(app_db)

    for path in ("/api/favors/favor_1", "/api/favors", "/api/favors/my"):
        response = await client.get(path, headers=auth("helper"))
        assert "secretqrtoken123" not in response.text, path


async def test_only_helper_can_scan_qr(client, app_db):
    await seed(app_db)

    payer_scan = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": "secretqrtoken123"}, headers=auth("creator"))
    wrong_code = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": "nope"}, headers=auth("helper"))
    good_scan = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": "secretqrtoken123"}, headers=auth("helper"))
    replay = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": "secretqrtoken123"}, headers=auth("helper"))

    assert payer_scan.status_code == 403
    assert wrong_code.status_code == 400
    assert good_scan.status_code == 200
    assert replay.status_code == 400  # already completed
    assert await balance(app_db, "helper") == 13


async def test_qr_payload_format_from_qr_image_is_accepted(client, app_db):
    await seed(app_db)
    payload = str({"type": "scambio_favori", "code": "secretqrtoken123", "favor_id": "favor_1", "app": "Scambio di Favori"})

    response = await client.post("/api/favors/favor_1/verify-qr", json={"qr_code": payload}, headers=auth("helper"))

    assert response.status_code == 200


async def test_mock_qr_scan_is_locked_for_regular_users(client, app_db, monkeypatch):
    await seed(app_db)
    monkeypatch.setattr(favors_routes, "REVIEWER_MODE_ENABLED", True)

    response = await client.post("/api/debug/mock-qr-scan", params={"favor_id": "favor_1"}, headers=auth("creator"))

    assert response.status_code == 403
    assert await balance(app_db, "helper") == 10


async def test_mock_qr_scan_disabled_even_for_reviewer_when_flag_off(client, app_db, monkeypatch):
    await app_db.users.insert_one(make_user("creator", email=core.REVIEWER_EMAIL))
    await app_db.users.insert_one(make_user("helper"))
    await app_db.favors.insert_one(make_favor())
    monkeypatch.setattr(favors_routes, "REVIEWER_MODE_ENABLED", False)

    response = await client.post("/api/debug/mock-qr-scan", params={"favor_id": "favor_1"}, headers=auth("creator"))

    assert response.status_code == 403
