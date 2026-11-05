"""Profilo: "Chi sono" (breve presentazione pubblica) e Fondo Solidarietà (chi è in debito può chiedere un dono)."""
from datetime import datetime, timezone

import pytest

from conftest import auth, make_user

BIO = "/api/user/bio"
FUND = "/api/donations/fund"
RECOVERY = "/api/debt-recovery/request"


async def put_bio(client, user, text):
    return await client.put(BIO, json={"bio": text}, headers=auth(user))


# ---------- Chi sono ----------

async def test_bio_is_saved_trimmed_and_shown_on_the_public_profile(client, app_db):
    await app_db.users.insert_many([make_user("author"), make_user("viewer")])
    response = await put_bio(client, "author", "  Ciao! Faccio piccoli lavori e adoro cucinare.  ")
    assert response.status_code == 200
    assert (await app_db.users.find_one({"user_id": "author"}))["bio"] == "Ciao! Faccio piccoli lavori e adoro cucinare."
    body = (await client.get("/api/users/author/public", headers=auth("viewer"))).json()
    assert body["bio"] == "Ciao! Faccio piccoli lavori e adoro cucinare."


async def test_bio_is_part_of_the_own_user(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    await put_bio(client, "me", "Sono Marco")
    me = (await client.get("/api/auth/me", headers=auth("me"))).json()
    assert me["bio"] == "Sono Marco"


async def test_empty_bio_clears_it(client, app_db):
    await app_db.users.insert_one(make_user("me", bio="Vecchia presentazione"))
    assert (await put_bio(client, "me", "   ")).status_code == 200
    assert not (await app_db.users.find_one({"user_id": "me"})).get("bio")


@pytest.mark.parametrize("text", [
    "a" * 201, "Chiamami al 345 000 1234", "Scrivimi su WhatsApp", "Visita https://esempio.it", "Pago 50 euro", "Sei uno stronzo",
])
async def test_unsafe_bio_is_refused(client, app_db, text):
    await app_db.users.insert_one(make_user("me"))
    assert (await put_bio(client, "me", text)).status_code == 400


async def test_bio_needs_a_login(client):
    assert (await client.put(BIO, json={"bio": "ciao"})).status_code == 401


# ---------- Fondo Solidarietà ----------

async def donate_to_fund(app_db, amount):
    await app_db.donations.insert_one({"donation_id": "d1", "donor_id": "rich", "donor_name": "rich", "recipient_id": None,
                                       "recipient_name": None, "amount": amount, "is_solidarity_fund": True, "message": None,
                                       "created_at": datetime.now(timezone.utc)})


async def fund_total(client):
    return (await client.get(FUND)).json()["solidarity_fund_total"]


async def test_a_helper_in_debt_can_ask_the_fund_and_the_fund_goes_down(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=-2, total_favors_given=1))
    await donate_to_fund(app_db, 10)
    response = await client.post(RECOVERY, headers=auth("me"))
    assert response.status_code == 200 and response.json()["amount_received"] == 2
    assert (await app_db.users.find_one({"user_id": "me"}))["granelli"] == 0
    assert await fund_total(client) == 8


async def test_asking_twice_is_refused_while_a_request_is_active(client, app_db):
    await app_db.users.insert_one(make_user("me", granelli=-9, total_favors_given=1))
    await donate_to_fund(app_db, 30)
    assert (await client.post(RECOVERY, headers=auth("me"))).status_code == 200
    assert (await client.post(RECOVERY, headers=auth("me"))).status_code == 400


async def test_not_in_debt_or_empty_fund_means_no_gift(client, app_db):
    await app_db.users.insert_many([make_user("me", granelli=5, total_favors_given=1), make_user("poor", granelli=-3, total_favors_given=1)])
    assert (await client.post(RECOVERY, headers=auth("me"))).status_code == 400
    assert (await client.post(RECOVERY, headers=auth("poor"))).status_code == 400  # fondo vuoto


async def test_someone_who_never_helped_cannot_drain_the_fund(client, app_db):
    await app_db.users.insert_one(make_user("newbie", granelli=-3, total_favors_given=0))
    await donate_to_fund(app_db, 10)
    response = await client.post(RECOVERY, headers=auth("newbie"))
    assert response.status_code == 403
    assert await fund_total(client) == 10


# ---------- niente classifica ----------

async def test_the_leaderboard_is_gone(client, app_db):
    await app_db.users.insert_one(make_user("me"))
    assert (await client.get("/api/leaderboard", headers=auth("me"))).status_code == 404
