"""Profile picture storage: magic-byte validation, S3 upload, local fallback."""
import pytest
from fastapi import HTTPException

import storage
from conftest import auth, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"0" * 32


class FakeS3:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def put_object(self, **kwargs):
        if self.fail:
            raise RuntimeError("boom")
        self.calls.append(kwargs)


@pytest.fixture
def s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setenv("AWS_REGION", "eu-south-1")
    monkeypatch.delenv("S3_PUBLIC_BASE_URL", raising=False)
    monkeypatch.setattr(storage, "_get_s3_client", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def local_by_default(monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)


@pytest.mark.parametrize("content,expected", [(PNG, "png"), (JPEG, "jpg"), (WEBP, "webp")])
def test_detects_type_from_magic_bytes(content, expected):
    assert storage.detect_image_type(content)[1] == expected


def test_rejects_non_image_bytes():
    assert storage.detect_image_type(b"<?php echo 1; ?>") is None


async def test_local_storage_saves_file_and_returns_relative_url(tmp_path):
    url = await storage.save_profile_picture("u1", PNG, tmp_path)

    assert url.startswith("/uploads/profile_pictures/u1_") and url.endswith(".png")
    assert (tmp_path / url.rsplit("/", 1)[1]).read_bytes() == PNG


async def test_rejects_disguised_file_regardless_of_name(tmp_path):
    with pytest.raises(HTTPException) as exc:
        await storage.save_profile_picture("u1", b"<script>alert(1)</script>", tmp_path)

    assert exc.value.status_code == 400
    assert list(tmp_path.iterdir()) == []


async def test_rejects_oversized_image(tmp_path):
    with pytest.raises(HTTPException) as exc:
        await storage.save_profile_picture("u1", PNG + b"0" * storage.MAX_IMAGE_BYTES, tmp_path)

    assert exc.value.status_code == 400


async def test_s3_upload_uses_detected_content_type_and_bucket_url(s3, tmp_path):
    url = await storage.save_profile_picture("u1", JPEG, tmp_path)

    call = s3.calls[0]
    assert call["Bucket"] == "my-bucket"
    assert call["Key"].startswith("profile_pictures/u1_") and call["Key"].endswith(".jpg")
    assert call["ContentType"] == "image/jpeg"
    assert url == f"https://my-bucket.s3.eu-south-1.amazonaws.com/{call['Key']}"
    assert list(tmp_path.iterdir()) == []  # nothing written to local disk


async def test_s3_public_base_url_overrides_bucket_url(s3, monkeypatch, tmp_path):
    monkeypatch.setenv("S3_PUBLIC_BASE_URL", "https://cdn.example.com/")

    url = await storage.save_profile_picture("u1", PNG, tmp_path)

    assert url == f"https://cdn.example.com/{s3.calls[0]['Key']}"


async def test_s3_failure_returns_502(monkeypatch, tmp_path):
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setattr(storage, "_get_s3_client", lambda: FakeS3(fail=True))

    with pytest.raises(HTTPException) as exc:
        await storage.save_profile_picture("u1", PNG, tmp_path)

    assert exc.value.status_code == 502


async def test_upload_endpoint_stores_absolute_s3_url_on_user(client, app_db, s3):
    await app_db.users.insert_one(make_user("u1"))

    response = await client.post("/api/users/me/picture", files={"file": ("a.png", PNG, "image/png")}, headers=auth("u1"))

    assert response.status_code == 200
    picture = response.json()["picture"]
    assert picture.startswith("https://my-bucket.s3.")
    assert (await app_db.users.find_one({"user_id": "u1"}))["picture"] == picture
