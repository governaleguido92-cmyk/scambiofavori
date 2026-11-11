"""Modifica di un favore pubblicato, finché nessuno l'ha accettato."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import auth, make_favor, make_user


def active_favor(**extra):
    return make_favor(
        status="active",
        type="offer",
        accepted_by=None,
        accepted_by_name=None,
        title="Aiuto con la spesa",
        description="Porto la spesa a casa",
        category="Spesa",
        duration_hours=1.0,
        granelli_cost=1,
        validity_days=3,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        approximate_latitude=37.93149,
        approximate_longitude=12.33051,
        exact_latitude=37.9000,
        exact_longitude=12.3000,
        **extra,
    )


async def seed(app_db, **favor_extra):
    await app_db.users.insert_many([make_user("creator"), make_user("other")])
    await app_db.favors.insert_one(active_favor(**favor_extra))


def naive_utc(moment):
    return moment.astimezone(timezone.utc).replace(tzinfo=None) if moment.tzinfo else moment


async def test_creator_can_edit_the_texts_and_the_cost_follows_the_duration(client, app_db):
    await seed(app_db)

    response = await client.put(
        "/api/favors/favor_1",
        json={"title": "Spesa al mercato", "description": "Mi occupo io di portarla", "category": "Cucina", "duration_hours": 3},
        headers=auth("creator"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Spesa al mercato"
    assert body["category"] == "Cucina"
    assert body["duration_hours"] == 3
    assert body["granelli_cost"] == 3
    assert "qr_code" not in body
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["description"] == "Mi occupo io di portarla"


async def test_only_the_sent_fields_change(client, app_db):
    await seed(app_db)

    response = await client.put("/api/favors/favor_1", json={"title": "Solo il titolo"}, headers=auth("creator"))

    assert response.status_code == 200
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["title"] == "Solo il titolo"
    assert stored["description"] == "Porto la spesa a casa"
    assert stored["category"] == "Spesa"
    assert stored["granelli_cost"] == 1


async def test_new_validity_restarts_the_expiry_from_now(client, app_db):
    await seed(app_db)

    response = await client.put("/api/favors/favor_1", json={"validity_days": 5}, headers=auth("creator"))

    assert response.status_code == 200
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    expected = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=5)
    assert abs((naive_utc(stored["expires_at"]) - expected).total_seconds()) < 10
    assert stored["validity_days"] == 5


async def test_validity_is_kept_between_1_and_5_days(client, app_db):
    await seed(app_db)

    await client.put("/api/favors/favor_1", json={"validity_days": 99}, headers=auth("creator"))

    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["validity_days"] == 5


async def test_type_owner_and_position_never_change(client, app_db):
    await seed(app_db)

    await client.put(
        "/api/favors/favor_1",
        json={"title": "Nuovo", "type": "request", "creator_id": "other", "approximate_latitude": 1.0, "status": "completed"},
        headers=auth("creator"),
    )

    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["type"] == "offer"
    assert stored["creator_id"] == "creator"
    assert stored["approximate_latitude"] == 37.93149
    assert stored["status"] == "active"


async def test_response_hides_the_exact_position(client, app_db):
    await seed(app_db)

    body = (await client.put("/api/favors/favor_1", json={"title": "Nuovo"}, headers=auth("creator"))).json()

    assert body["exact_latitude"] is None and body["exact_longitude"] is None


async def test_someone_else_cannot_edit(client, app_db):
    await seed(app_db)

    response = await client.put("/api/favors/favor_1", json={"title": "Furto"}, headers=auth("other"))

    assert response.status_code == 403
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["title"] == "Aiuto con la spesa"


async def test_requires_login(client, app_db):
    await seed(app_db)

    assert (await client.put("/api/favors/favor_1", json={"title": "x"})).status_code == 401


async def test_unknown_favor_is_404(client, app_db):
    await app_db.users.insert_one(make_user("creator"))

    assert (await client.put("/api/favors/nope", json={"title": "x"}, headers=auth("creator"))).status_code == 404


@pytest.mark.parametrize("status,accepted_by", [("accepted", "helper"), ("completed", "helper"), ("cancelled", None)])
async def test_only_favors_nobody_accepted_can_be_edited(client, app_db, status, accepted_by):
    await seed(app_db, **{})
    await app_db.favors.update_one({"favor_id": "favor_1"}, {"$set": {"status": status, "accepted_by": accepted_by}})

    response = await client.put("/api/favors/favor_1", json={"title": "Tardi"}, headers=auth("creator"))

    assert response.status_code == 400
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["title"] == "Aiuto con la spesa"


async def test_an_expired_favor_can_be_edited_and_comes_back(client, app_db):
    await seed(app_db)
    await app_db.favors.update_one({"favor_id": "favor_1"}, {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}})

    response = await client.put("/api/favors/favor_1", json={"title": "Di nuovo", "validity_days": 3}, headers=auth("creator"))

    assert response.status_code == 200
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert naive_utc(stored["expires_at"]) > datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": "   "},
        {"description": ""},
        {"title": "x" * 101},
        {"description": "y" * 501},
        {"duration_hours": 0},
        {"duration_hours": -2},
        {"category": "Inesistente"},
    ],
)
async def test_invalid_edits_are_rejected_and_change_nothing(client, app_db, payload):
    await seed(app_db)

    response = await client.put("/api/favors/favor_1", json=payload, headers=auth("creator"))

    assert response.status_code in (400, 422)  # 422: durata non in ore intere, rifiutata dal modello
    stored = await app_db.favors.find_one({"favor_id": "favor_1"})
    assert stored["title"] == "Aiuto con la spesa" and stored["granelli_cost"] == 1


@pytest.mark.parametrize(
    "payload",
    [{"title": "ti ammazzo"}, {"description": "sporchi immigrati"}, {"title": "Aiuto vaffanculo"}],
)
async def test_harmful_text_is_blocked_on_edit_too(client, app_db, payload):
    await seed(app_db)

    response = await client.put("/api/favors/favor_1", json=payload, headers=auth("creator"))

    assert response.status_code == 400
    assert "Contenuto non consentito" in response.json()["detail"]
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["title"] == "Aiuto con la spesa"


async def test_a_request_cannot_cost_more_than_the_granelli_you_have(client, app_db):
    await seed(app_db, **{})
    await app_db.favors.update_one({"favor_id": "favor_1"}, {"$set": {"type": "request"}})
    await app_db.users.update_one({"user_id": "creator"}, {"$set": {"granelli": 2}})

    response = await client.put("/api/favors/favor_1", json={"duration_hours": 5}, headers=auth("creator"))

    assert response.status_code == 400
    assert (await app_db.favors.find_one({"favor_id": "favor_1"}))["granelli_cost"] == 1


async def test_an_offer_can_cost_any_amount(client, app_db):
    await seed(app_db)
    await app_db.users.update_one({"user_id": "creator"}, {"$set": {"granelli": 0}})

    response = await client.put("/api/favors/favor_1", json={"duration_hours": 5}, headers=auth("creator"))

    assert response.status_code == 200
    assert response.json()["granelli_cost"] == 5
