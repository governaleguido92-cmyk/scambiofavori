"""La durata di un favore va di ora in ora: niente mezze ore, né quando si pubblica né quando si modifica."""
from datetime import datetime, timedelta, timezone

from conftest import auth, make_favor, make_user
from test_trust_safety import FAVOR_BODY


async def test_whole_hours_are_accepted_also_when_sent_as_decimals(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))

    for hours in (1, 2.0, 3):
        response = await client.post("/api/favors", json={**FAVOR_BODY, "duration_hours": hours}, headers=auth("me"))
        assert response.status_code == 200, (hours, response.text)


async def test_half_hours_and_less_than_one_hour_are_refused(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=50, total_favors_given=5))

    for hours in (0.5, 1.5, 0, -1):
        response = await client.post("/api/favors", json={**FAVOR_BODY, "duration_hours": hours}, headers=auth("me"))
        assert response.status_code == 422, (hours, response.text)


async def test_editing_to_half_an_hour_is_refused(client, app_db):
    await app_db.users.insert_many([make_user("creator")])
    await app_db.favors.insert_one(make_favor(
        status="active", type="offer", accepted_by=None, creator_id="creator", duration_hours=1.0, granelli_cost=1,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1)))

    response = await client.put("/api/favors/favor_1", json={"duration_hours": 2.5}, headers=auth("creator"))

    assert response.status_code == 422, response.text
