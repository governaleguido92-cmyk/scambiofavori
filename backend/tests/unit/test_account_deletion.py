"""Account deletion: the profile picture must be removed from storage, and only the user's own file."""
import pytest

import storage
from conftest import auth, make_user


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
