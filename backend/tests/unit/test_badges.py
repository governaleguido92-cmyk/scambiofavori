"""Badge comunitari: regole giuste (contano i favori dati, non quelli ricevuti), non truccabili, nella palette del logo, con progresso."""
from datetime import datetime, timedelta, timezone

import pytest

import core
from conftest import auth, make_favor, make_user

NOW = datetime.now(timezone.utc)
PALETTE = {"#98AA4A", "#F87828", "#7A8B3A", "#FB9A52"}


async def user(app_db, uid="u1", **extra):
    await app_db.users.insert_one(make_user(uid, **extra))
    return uid


async def earned(app_db, uid="u1"):
    await core.check_and_award_badges(uid)
    return set((await app_db.users.find_one({"user_id": uid})).get("badges", []))


# ---------- definizioni ----------

def test_every_badge_uses_the_logo_palette_and_its_own_icon():
    assert {b["color"] for b in core.BADGES.values()} <= PALETTE
    icons = [b["icon"] for b in core.BADGES.values()]
    assert len(icons) == len(set(icons))


def test_profile_badge_is_part_of_the_list():
    assert "profilo_completo" in core.BADGES


async def test_badges_endpoint_lists_all_of_them(client):
    ids = {b["id"] for b in (await client.get("/api/badges")).json()}
    assert ids == set(core.BADGES)


# ---------- Fulmine: ora si può ottenere ----------

async def test_micro_favors_count_only_for_the_helper(app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor(duration_hours=1.0))
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))
    await core.settle_favor(favor)
    assert (await app_db.users.find_one({"user_id": "helper"}))["micro_favors_completed"] == 1
    assert (await app_db.users.find_one({"user_id": "creator"})).get("micro_favors_completed", 0) == 0


async def test_long_favors_are_not_micro(app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor(duration_hours=2.0, granelli_cost=2))
    favor = core.Favor(**await app_db.favors.find_one({"favor_id": "favor_1"}))
    await core.settle_favor(favor)
    assert (await app_db.users.find_one({"user_id": "helper"})).get("micro_favors_completed", 0) == 0


async def test_fulmine_after_ten_micro_favors(app_db):
    uid = await user(app_db, micro_favors_completed=10)
    assert "fulmine" in await earned(app_db, uid)


# ---------- contano i favori DATI ----------

async def test_receiving_favors_does_not_make_you_a_hero_or_unlock_the_fund(app_db):
    uid = await user(app_db, total_favors_received=30, total_favors_given=0)
    badges = await earned(app_db, uid)
    assert "eroe_quartiere" not in badges and "pilastro_quartiere" not in badges
    assert not (await app_db.users.find_one({"user_id": uid})).get("can_access_solidarity_fund")


async def test_five_given_favors_make_a_hero_and_unlock_the_fund(app_db):
    uid = await user(app_db, total_favors_given=5)
    assert "eroe_quartiere" in await earned(app_db, uid)
    assert (await app_db.users.find_one({"user_id": uid}))["can_access_solidarity_fund"] is True


async def test_first_step_counts_either_role(app_db):
    uid = await user(app_db, total_favors_received=1)
    assert "primo_passo" in await earned(app_db, uid)


async def test_pilastro_needs_twenty_given(app_db):
    assert "pilastro_quartiere" not in await earned(app_db, await user(app_db, "a", total_favors_given=19))
    assert "pilastro_quartiere" in await earned(app_db, await user(app_db, "b", total_favors_given=20))


# ---------- 5 stelle da persone diverse ----------

async def review(app_db, reviewer, reviewed, favor_id):
    await app_db.favors.insert_one(make_favor(favor_id, creator_id=reviewer, creator_name=reviewer, accepted_by=reviewed, status="completed"))


async def test_perfect_reviews_from_the_same_person_count_once(client, app_db):
    await app_db.users.insert_many([make_user("friend"), make_user("helper")])
    for i in range(3):
        await app_db.favors.insert_one(make_favor(f"f{i}", creator_id="friend", creator_name="friend", accepted_by="helper",
                                                  status="completed", completed_at=NOW))
        response = await client.post("/api/reviews", json={"favor_id": f"f{i}", "rating": 5, "kindness_rating": 5, "impact_rating": 5},
                                     headers=auth("friend"))
        assert response.status_code == 200, response.text
    assert (await app_db.users.find_one({"user_id": "helper"}))["perfect_reviews_count"] == 1


# ---------- titolo coerente con i badge ----------

def test_title_does_not_follow_a_rating_without_the_badge():
    assert core.get_user_title({"badges": [], "average_rating": 4.9}) == "Nuovo Vicino"
    assert core.get_user_title({"badges": ["vicino_virtuoso"], "average_rating": 4.9}) == "Vicino Virtuoso"


# ---------- badge nuovi ----------

async def test_puntuale_needs_ten_favors_and_few_late_cancellations(app_db):
    ok = await user(app_db, "ok", total_favors_given=10)
    assert "puntuale" in await earned(app_db, ok)

    late = await user(app_db, "late", total_favors_given=10)
    await app_db.favors.insert_many([make_favor(f"c{i}", creator_id="x", creator_name="x", status="cancelled", cancelled_by="late",
                                                cancelled_after_accept=True) for i in range(3)])
    assert "puntuale" not in await earned(app_db, late)

    few = await user(app_db, "few", total_favors_given=10)
    await app_db.favors.insert_one(make_favor("c9", creator_id="x", creator_name="x", status="cancelled", cancelled_by="few",
                                              cancelled_after_accept=True))
    assert "puntuale" in await earned(app_db, few)  # 1 annullamento su 11 (9%): ancora sotto il limite del 10%


async def test_garante_fidato_needs_three_vouches_with_nobody_on_hold(app_db):
    uid = await user(app_db, "g")
    for name in ("a", "b", "c"):
        await app_db.users.insert_one(make_user(name))
        await app_db.vouches.insert_one({"vouch_id": f"v_{name}", "voucher_id": "g", "vouchee_id": name, "created_at": NOW})
    assert "garante_fidato" in await earned(app_db, uid)

    uid2 = await user(app_db, "g2")
    for name in ("d", "e", "f"):
        await app_db.users.insert_one(make_user(name, safety_hold=(name == "f")))
        await app_db.vouches.insert_one({"vouch_id": f"v2_{name}", "voucher_id": "g2", "vouchee_id": name, "created_at": NOW})
    assert "garante_fidato" not in await earned(app_db, uid2)


async def test_vicino_di_casa_needs_five_different_people(app_db):
    uid = await user(app_db, "h")
    for i in range(5):
        await app_db.favors.insert_one(make_favor(f"n{i}", creator_id=f"p{i}", creator_name=f"p{i}", accepted_by="h",
                                                  accepted_by_name="h", status="completed", completed_at=NOW))
    assert "vicino_di_casa" in await earned(app_db, uid)

    uid2 = await user(app_db, "h2")
    for i in range(6):  # sei favori alla stessa persona
        await app_db.favors.insert_one(make_favor(f"m{i}", creator_id="same", creator_name="same", accepted_by="h2",
                                                  accepted_by_name="h2", status="completed", completed_at=NOW))
    assert "vicino_di_casa" not in await earned(app_db, uid2)


async def test_organizzatore_and_benvenuto_use_counters(app_db):
    assert "organizzatore" in await earned(app_db, await user(app_db, "o", events_with_guests=3))
    assert "organizzatore" not in await earned(app_db, await user(app_db, "o2", events_with_guests=2))
    assert "benvenuto" in await earned(app_db, await user(app_db, "w", welcomes_given=10))


# ---------- notifica e progresso ----------

async def test_earning_a_badge_creates_one_notification(app_db):
    uid = await user(app_db, total_favors_received=1)
    await earned(app_db, uid)
    await earned(app_db, uid)
    notes = await app_db.notifications.find({"user_id": uid, "type": "badge_earned"}).to_list(10)
    assert len(notes) == 1 and "Primo Passo" in notes[0]["message"]


async def test_progress_endpoint_reports_current_and_target(client, app_db):
    uid = await user(app_db, total_favors_given=7, micro_favors_completed=4)
    body = (await client.get("/api/badges/progress", headers=auth(uid))).json()["progress"]
    assert body["pilastro_quartiere"] == {"current": 7, "target": 20, "earned": False, "blocked": False}
    assert body["fulmine"]["current"] == 4 and body["fulmine"]["target"] == 10
    assert body["eroe_quartiere"]["current"] == 5 and body["eroe_quartiere"]["target"] == 5  # tetto al traguardo


async def test_progress_needs_login(client):
    assert (await client.get("/api/badges/progress")).status_code == 401


# ---------- contatori di Organizzatore e Benvenuto, dal quartiere ----------

async def test_first_guest_counts_the_event_for_the_organizer(client, app_db):
    from test_neighborhood_social import open_favor
    await app_db.users.insert_many([make_user("org", email_verified=True), make_user("g1", email_verified=True), make_user("g2", email_verified=True)])
    await app_db.favors.insert_many([open_favor("fo", "org"), open_favor("f1", "g1", 2), open_favor("f2", "g2", 2)])
    event_id = (await client.post("/api/neighborhood/events", json={
        "kind": "evento", "title": "Caffè", "description": "", "place": "Piazza",
        "starts_at": (NOW + timedelta(days=1)).isoformat()}, headers=auth("org"))).json()["event_id"]

    await client.post(f"/api/neighborhood/events/{event_id}/join", headers=auth("g1"))
    await client.post(f"/api/neighborhood/events/{event_id}/join", headers=auth("g2"))  # il secondo ospite non conta di nuovo
    assert (await app_db.users.find_one({"user_id": "org"}))["events_with_guests"] == 1


async def test_welcome_counter_goes_up_and_down(client, app_db):
    from test_neighborhood_social import with_position
    await with_position(app_db, "new")
    await with_position(app_db, "kind", 1)
    await client.put("/api/neighborhood/intro", json={"text": "Ciao a tutti, sono arrivato da poco."}, headers=auth("new"))
    intro_id = (await client.get("/api/neighborhood/intros", headers=auth("kind"))).json()["intros"][0]["intro_id"]
    await client.post(f"/api/neighborhood/intros/{intro_id}/welcome", headers=auth("kind"))
    assert (await app_db.users.find_one({"user_id": "kind"}))["welcomes_given"] == 1
    await client.post(f"/api/neighborhood/intros/{intro_id}/welcome", headers=auth("kind"))
    assert (await app_db.users.find_one({"user_id": "kind"}))["welcomes_given"] == 0
