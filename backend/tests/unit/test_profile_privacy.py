"""Dati degli utenti: niente accesso senza login e niente email o dati privati di altri."""
from datetime import datetime, timezone

import pytest

from conftest import auth, make_favor, make_user


def review(review_id="r1", favor_id="favor_1", reviewed_id="target", **extra):
    return {
        "review_id": review_id,
        "favor_id": favor_id,
        "reviewer_id": "reviewer",
        "reviewer_name": "Marta",
        "reviewed_id": reviewed_id,
        "rating": 5,
        "kindness_rating": 5,
        "impact_rating": 5,
        "ethical_tags": [],
        "comment": "Bravissimo",
        "created_at": datetime.now(timezone.utc),
        **extra,
    }


async def seed(app_db):
    await app_db.users.insert_many(
        [
            make_user("me", email="me@example.com", community_score=10),
            make_user("target", email="segreta@example.com", community_score=50, referral_code="REF123", granelli=7),
            make_user("third", email="altra@example.com", community_score=30),
        ]
    )
    await app_db.reviews.insert_one(review())


@pytest.mark.parametrize(
    "path",
    ["/api/users/target", "/api/users/target/public", "/api/reviews/user/target", "/api/reviews/favor/favor_1"],
)
async def test_these_endpoints_need_a_login(client, app_db, path):
    await seed(app_db)

    response = await client.get(path)

    assert response.status_code == 401


async def test_you_can_read_your_own_full_profile(client, app_db):
    await seed(app_db)

    response = await client.get("/api/users/me", headers=auth("me"))

    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


async def test_the_full_profile_of_someone_else_is_off_limits(client, app_db):
    await seed(app_db)

    response = await client.get("/api/users/target", headers=auth("me"))

    assert response.status_code == 403
    assert "segreta@example.com" not in response.text


async def test_public_profile_of_someone_else_hides_private_data(client, app_db):
    await seed(app_db)

    response = await client.get("/api/users/target/public", headers=auth("me"))

    assert response.status_code == 200
    body = response.text
    assert "segreta@example.com" not in body
    assert "REF123" not in body
    assert response.json()["name"] == "target"


async def test_reviews_of_a_user_are_readable_only_by_that_user(client, app_db):
    await seed(app_db)

    own = await client.get("/api/reviews/user/target", headers=auth("target"))
    other = await client.get("/api/reviews/user/target", headers=auth("me"))

    assert own.status_code == 200
    assert [r["review_id"] for r in own.json()] == ["r1"]
    assert other.status_code == 403


async def test_reviews_of_a_favor_are_readable_only_by_its_participants(client, app_db):
    await seed(app_db)
    await app_db.favors.insert_one(make_favor("favor_1", creator_id="me", creator_name="me", accepted_by="target"))

    participant = await client.get("/api/reviews/favor/favor_1", headers=auth("me"))
    stranger = await client.get("/api/reviews/favor/favor_1", headers=auth("third"))

    assert participant.status_code == 200
    assert len(participant.json()) == 1
    assert stranger.status_code == 404
