"""Profilo pubblico: serve a conoscere con chi si scambia un favore. Mostra fiducia e reputazione, mai dati privati."""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import auth, make_favor, make_user

NOW = datetime.now(timezone.utc)


def review(review_id, reviewer, reviewed="target", rating=5, comment="Bravissimo", **extra):
    return {"review_id": review_id, "favor_id": f"fav_{review_id}", "reviewer_id": reviewer, "reviewer_name": reviewer.title(),
            "reviewed_id": reviewed, "rating": rating, "kindness_rating": rating, "impact_rating": rating, "ethical_tags": [],
            "comment": comment, "created_at": NOW, **extra}


async def seed(app_db, **extra):
    await app_db.users.insert_many([
        make_user("viewer", email="viewer@example.com"),
        make_user("target", email="segreta@example.com", phone="3331112222", phone_hash="abc", birth_year=1980, granelli=42,
                  approximate_latitude=37.9, approximate_longitude=12.3, referral_code="REF123", phone_verified=True,
                  identity_verified=True, badges=["primo_passo", "eroe_quartiere"], skills=["Spesa", "Computer"],
                  total_favors_given=7, total_favors_received=3, average_rating=4.8, created_at=datetime(2026, 3, 15, tzinfo=timezone.utc),
                  **extra),
    ])


async def profile(client, viewer="viewer", target="target"):
    return await client.get(f"/api/users/{target}/public", headers=auth(viewer))


async def test_profile_shows_what_helps_to_choose(client, app_db):
    await seed(app_db)
    body = (await profile(client)).json()
    assert body["name"] == "target" and body["total_favors_given"] == 7 and body["total_favors_received"] == 3
    assert body["average_rating"] == 4.8
    assert body["phone_verified"] is True and body["identity_verified"] is True
    assert body["member_since"] == "2026-03"
    assert body["skills"] == ["Spesa", "Computer"]
    assert [b["id"] for b in body["badge_details"]] == ["primo_passo", "eroe_quartiere"]
    assert body["badge_details"][1]["name"] == "Eroe di Quartiere" and body["badge_details"][1]["icon"] == "trophy"


async def test_profile_never_shows_private_data(client, app_db):
    await seed(app_db)
    raw = (await profile(client)).text
    for secret in ("segreta@example.com", "3331112222", "abc", "1980", "REF123", "37.9", "12.3"):
        assert secret not in raw
    body = (await profile(client)).json()
    assert "granelli" not in body and "email" not in body and "safety_hold" not in body


async def test_recent_reviews_are_listed_with_the_reviewer_name(client, app_db):
    await seed(app_db)
    await app_db.reviews.insert_many([review(f"r{i}", f"rev{i}", comment=f"Commento {i}", created_at=NOW - timedelta(days=i)) for i in range(7)])
    body = (await profile(client)).json()
    assert body["reviews_count"] == 7
    recent = body["recent_reviews"]
    assert len(recent) == 5 and recent[0]["comment"] == "Commento 0" and recent[0]["reviewer_name"] == "Rev0"
    assert set(recent[0]) == {"reviewer_name", "rating", "comment", "created_at"}


async def test_reliability_counts_late_cancellations(client, app_db):
    await seed(app_db)
    await app_db.favors.insert_one(make_favor("c1", creator_id="x", creator_name="x", status="cancelled", cancelled_by="target",
                                              cancelled_after_accept=True))
    body = (await profile(client)).json()
    assert body["late_cancellations"] == 1


async def test_blocked_people_do_not_see_each_other(client, app_db):
    await seed(app_db)
    await app_db.blocked_users.insert_one({"block_id": "b1", "blocker_id": "target", "blocked_id": "viewer", "created_at": NOW})
    assert (await profile(client)).status_code == 404
    assert (await profile(client, viewer="target", target="viewer")).status_code == 404


async def test_own_profile_and_unknown_users(client, app_db):
    await seed(app_db)
    assert (await profile(client, viewer="target", target="target")).status_code == 200
    assert (await profile(client, target="non_esiste")).status_code == 404


async def test_profile_of_someone_on_hold_does_not_reveal_it(client, app_db):
    await seed(app_db, safety_hold=True)
    raw = (await profile(client)).text
    assert "safety_hold" not in raw and "revisione" not in raw.lower()


async def test_profile_needs_a_login(client, app_db):
    await seed(app_db)
    assert (await client.get("/api/users/target/public")).status_code == 401
