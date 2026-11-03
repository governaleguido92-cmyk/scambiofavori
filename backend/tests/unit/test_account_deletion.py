"""Account deletion: the profile picture must be removed from storage, and only the user's own file."""
import pytest

import storage
from conftest import auth, make_favor, make_user


class FakeS3:
    def __init__(self, fail=False):
        self.deleted = []
        self.fail = fail

    def delete_object(self, **kwargs):
        if self.fail:
            raise RuntimeError("boom")
        self.deleted.append(kwargs)


@pytest.fixture
def s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setenv("S3_PUBLIC_BASE_URL", "https://pub-x.r2.dev")
    monkeypatch.setattr(storage, "_get_s3_client", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def local_by_default(monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.delenv("S3_PUBLIC_BASE_URL", raising=False)


async def test_deletes_own_s3_picture(s3):
    await storage.delete_profile_picture("u1", "https://pub-x.r2.dev/profile_pictures/u1_ab12cd34.jpg", None)

    assert s3.deleted == [{"Bucket": "my-bucket", "Key": "profile_pictures/u1_ab12cd34.jpg"}]


async def test_never_deletes_another_users_picture(s3):
    await storage.delete_profile_picture("u1", "https://pub-x.r2.dev/profile_pictures/u2_ab12cd34.jpg", None)

    assert s3.deleted == []


async def test_ignores_external_picture_urls(s3):
    await storage.delete_profile_picture("u1", "https://lh3.googleusercontent.com/a/u1_photo", None)

    assert s3.deleted == []


async def test_ignores_path_traversal(s3):
    await storage.delete_profile_picture("u1", "https://pub-x.r2.dev/profile_pictures/../u1_x.jpg", None)

    assert s3.deleted == []


async def test_deletes_local_picture(tmp_path):
    (tmp_path / "u1_ab12cd34.png").write_bytes(b"x")
    (tmp_path / "u2_ab12cd34.png").write_bytes(b"x")

    await storage.delete_profile_picture("u1", "/uploads/profile_pictures/u1_ab12cd34.png", tmp_path)

    assert sorted(p.name for p in tmp_path.iterdir()) == ["u2_ab12cd34.png"]


async def test_storage_failure_does_not_raise(monkeypatch):
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setenv("S3_PUBLIC_BASE_URL", "https://pub-x.r2.dev")
    monkeypatch.setattr(storage, "_get_s3_client", lambda: FakeS3(fail=True))

    await storage.delete_profile_picture("u1", "https://pub-x.r2.dev/profile_pictures/u1_ab12cd34.jpg", None)


async def test_delete_account_removes_picture_and_user(client, app_db, s3):
    url = "https://pub-x.r2.dev/profile_pictures/u1_ab12cd34.jpg"
    await app_db.users.insert_one(make_user("u1", email="u1@example.com", picture=url, avatar_url=url))

    response = await client.request("DELETE", "/api/account", json={"confirm_email": "U1@example.com"}, headers=auth("u1"))

    assert response.status_code == 200
    assert await app_db.users.find_one({"user_id": "u1"}) is None
    assert s3.deleted == [{"Bucket": "my-bucket", "Key": "profile_pictures/u1_ab12cd34.jpg"}]


async def test_delete_account_with_wrong_email_keeps_everything(client, app_db, s3):
    url = "https://pub-x.r2.dev/profile_pictures/u1_ab12cd34.jpg"
    await app_db.users.insert_one(make_user("u1", email="u1@example.com", picture=url))

    response = await client.request("DELETE", "/api/account", json={"confirm_email": "other@example.com"}, headers=auth("u1"))

    assert response.status_code == 400
    assert await app_db.users.find_one({"user_id": "u1"}) is not None
    assert s3.deleted == []


async def _delete(client, user: str, email: str):
    return await client.request("DELETE", "/api/account", json={"confirm_email": email}, headers=auth(user))


async def test_delete_account_removes_blocks_in_both_directions(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("u2"), make_user("u3")])
    await app_db.blocked_users.insert_many([
        {"block_id": "b1", "blocker_id": "u1", "blocked_id": "u2"},
        {"block_id": "b2", "blocker_id": "u3", "blocked_id": "u1"},
        {"block_id": "b3", "blocker_id": "u2", "blocked_id": "u3"},
    ])

    await _delete(client, "u1", "u1@example.com")

    remaining = [b["block_id"] async for b in app_db.blocked_users.find({})]
    assert remaining == ["b3"]


async def test_delete_account_removes_read_state_and_sms_requests(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("u2")])
    await app_db.chat_reads.insert_many([
        {"user_id": "u1", "favor_id": "f1"},
        {"user_id": "u2", "favor_id": "f1"},
    ])
    await app_db.phone_requests.insert_many([{"user_id": "u1"}, {"user_id": "u2"}])

    await _delete(client, "u1", "u1@example.com")

    assert [d["user_id"] async for d in app_db.chat_reads.find({})] == ["u2"]
    assert [d["user_id"] async for d in app_db.phone_requests.find({})] == ["u2"]


async def test_delete_account_removes_the_stored_phone_fingerprint(client, app_db):
    await app_db.users.insert_one(make_user("u1", email="u1@example.com", phone_verified=True, phone_hash="abc", phone_masked="••••1234"))

    await _delete(client, "u1", "u1@example.com")

    assert await app_db.users.find_one({"phone_hash": "abc"}) is None


# ---------- favori creati e chat ----------

def _msg(favor_id: str, sender: str, text: str) -> dict:
    return {"message_id": f"m_{favor_id}_{sender}", "favor_id": favor_id, "sender_id": sender, "sender_name": sender,
            "content": text, "message_type": "text", "created_at": None}


async def test_delete_account_deletes_created_favors_with_every_message(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("helper")])
    await app_db.favors.insert_one(make_favor("mine", creator_id="u1", creator_name="u1", accepted_by="helper"))
    await app_db.messages.insert_many([_msg("mine", "u1", "ciao"), _msg("mine", "helper", "arrivo")])

    response = await _delete(client, "u1", "u1@example.com")

    assert response.status_code == 200
    assert await app_db.favors.count_documents({"favor_id": "mine"}) == 0
    assert await app_db.messages.count_documents({"favor_id": "mine"}) == 0


async def test_delete_account_removes_everything_attached_to_the_deleted_favors(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("helper")])
    await app_db.favors.insert_one(make_favor("mine", creator_id="u1", creator_name="u1", accepted_by="helper"))
    await app_db.reviews.insert_one({"review_id": "r1", "favor_id": "mine", "reviewer_id": "helper", "reviewed_id": "u1"})
    await app_db.thanks.insert_one({"thanks_id": "t1", "favor_id": "mine", "giver_id": "helper", "receiver_id": "u1"})
    await app_db.chat_reads.insert_many([{"user_id": "helper", "favor_id": "mine"}, {"user_id": "helper", "favor_id": "other"}])
    await app_db.notifications.insert_many([
        {"notification_id": "n1", "user_id": "helper", "related_id": "mine"},
        {"notification_id": "n2", "user_id": "helper", "favor_id": "mine"},
        {"notification_id": "n3", "user_id": "helper", "related_id": "other"},
    ])

    await _delete(client, "u1", "u1@example.com")

    assert await app_db.reviews.count_documents({}) == 0
    assert await app_db.thanks.count_documents({}) == 0
    assert [d["favor_id"] async for d in app_db.chat_reads.find({})] == ["other"]
    assert [d["notification_id"] async for d in app_db.notifications.find({})] == ["n3"]


async def test_delete_account_removes_reviews_and_thanks_about_the_user(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("u2")])
    await app_db.favors.insert_one(make_favor("theirs", creator_id="u2", creator_name="u2", accepted_by="u1"))
    await app_db.reviews.insert_one({"review_id": "r1", "favor_id": "theirs", "reviewer_id": "u2", "reviewed_id": "u1"})
    await app_db.thanks.insert_one({"thanks_id": "t1", "favor_id": "theirs", "giver_id": "u2", "receiver_id": "u1"})

    await _delete(client, "u1", "u1@example.com")

    assert await app_db.reviews.count_documents({"reviewed_id": "u1"}) == 0
    assert await app_db.thanks.count_documents({"receiver_id": "u1"}) == 0


async def test_delete_account_keeps_other_peoples_favors_anonymizing_the_helper(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("u2")])
    await app_db.favors.insert_one(make_favor("theirs", creator_id="u2", creator_name="u2", accepted_by="u1", accepted_by_name="u1"))
    await app_db.messages.insert_many([_msg("theirs", "u1", "ciao"), _msg("theirs", "u2", "grazie")])

    await _delete(client, "u1", "u1@example.com")

    favor = await app_db.favors.find_one({"favor_id": "theirs"})
    assert favor is not None
    assert favor["accepted_by"] == "deleted_user"
    assert [m["sender_id"] async for m in app_db.messages.find({"favor_id": "theirs"})] == ["u2"]


async def test_delete_account_keeps_reviews_the_user_wrote_but_anonymous(client, app_db):
    await app_db.users.insert_many([make_user("u1", email="u1@example.com"), make_user("u2")])
    await app_db.favors.insert_one(make_favor("theirs", creator_id="u2", creator_name="u2", accepted_by="u1"))
    await app_db.reviews.insert_one({"review_id": "r1", "favor_id": "theirs", "reviewer_id": "u1", "reviewer_name": "u1", "reviewed_id": "u2"})

    await _delete(client, "u1", "u1@example.com")

    review = await app_db.reviews.find_one({"review_id": "r1"})
    assert review["reviewer_id"] == "deleted_user"
    assert review["reviewer_name"] != "u1"
