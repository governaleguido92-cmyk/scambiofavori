"""I favori si fanno di persona: serve un luogo, niente favori a distanza, e la conferma richiede di essere sul posto."""
import pytest

from routers import favors_routes
from conftest import auth, make_favor, make_user


@pytest.fixture(autouse=True)
def manual_completion_on(monkeypatch):
    """Questi test provano le regole del completamento (conti, distanza): usano la strada senza QR, spenta in produzione."""
    from routers import favors_routes as _routes
    monkeypatch.setattr(_routes, "MANUAL_COMPLETION_ENABLED", True)


LAT, LON = 37.9300, 12.3300


def body(**extra):
    base = {"type": "request", "title": "Aiuto con la spesa", "description": "Servono due buste portate a casa",
            "category": "Spesa", "duration_hours": 1.0, "latitude": LAT, "longitude": LON}
    return {**base, **extra}


async def test_favor_without_a_place_is_refused(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    payload = body()
    del payload["latitude"], payload["longitude"]

    response = await client.post("/api/favors", json=payload, headers=auth("me"))

    assert response.status_code == 400
    assert "di persona" in response.json()["detail"].lower()
    assert await app_db.favors.count_documents({}) == 0


async def test_favor_with_a_place_is_accepted(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    response = await client.post("/api/favors", json=body(), headers=auth("me"))
    assert response.status_code == 200


@pytest.mark.parametrize("title", [
    "Ripetizioni online di matematica",
    "Aiuto a distanza con il computer",
    "Compagnia in videochiamata",
    "Lezione su Zoom",
    "Consulenza da remoto",
])
async def test_remote_favors_are_refused(client, app_db, title):
    await app_db.users.insert_one(make_user("me"))

    response = await client.post("/api/favors", json=body(title=title), headers=auth("me"))

    assert response.status_code == 400
    assert "di persona" in response.json()["detail"].lower()


@pytest.mark.parametrize("title", [
    "Aiuto con il telefono di mia nonna",
    "Sistemare il computer a casa mia",
    "Compagnia per una passeggiata",
    "Ripetizioni di matematica a casa",
])
async def test_in_person_favors_with_similar_words_pass(client, app_db, title):
    await app_db.users.insert_one(make_user("me"))
    response = await client.post("/api/favors", json=body(title=title), headers=auth("me"))
    assert response.status_code == 200


async def test_editing_into_a_remote_favor_is_refused(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await app_db.favors.insert_one(make_favor("f1", creator_id="me", creator_name="me", status="active", accepted_by=None,
                                              accepted_by_name=None))

    response = await client.put("/api/favors/f1", json={"title": "Aiuto online con il pc"}, headers=auth("me"))

    assert response.status_code == 400


async def test_completion_without_position_passes_while_proximity_is_not_required(client, app_db):
    await app_db.users.insert_many([make_user("creator", granelli=10), make_user("helper")])
    await app_db.favors.insert_one(make_favor(exact_latitude=LAT, exact_longitude=LON))
    response = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("creator"))
    assert response.status_code == 200


async def test_completion_needs_the_position_when_proximity_is_required(client, app_db, monkeypatch):
    monkeypatch.setattr(favors_routes, "PROXIMITY_REQUIRED", True)
    await app_db.users.insert_many([make_user("creator", granelli=10), make_user("helper")])
    await app_db.favors.insert_one(make_favor(exact_latitude=LAT, exact_longitude=LON))

    refused = await client.post("/api/favors/complete", json={"favor_id": "favor_1"}, headers=auth("creator"))
    allowed = await client.post(
        "/api/favors/complete", json={"favor_id": "favor_1", "latitude": LAT, "longitude": LON}, headers=auth("creator")
    )

    assert refused.status_code == 400
    assert "posizione" in refused.json()["detail"].lower()
    assert allowed.status_code == 200
