"""Profile picture storage: S3 (or any S3-compatible service) when configured, local disk otherwise.

Environment:
    S3_BUCKET            bucket name; enables S3 when set
    AWS_REGION           default eu-south-1
    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   standard boto3 credentials
    S3_ENDPOINT_URL      optional, for R2 / MinIO / other S3-compatible providers
    S3_PUBLIC_BASE_URL   optional public/CDN base URL (e.g. CloudFront); defaults to the bucket URL
"""
import asyncio
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

MAX_IMAGE_BYTES = 5 * 1024 * 1024
S3_PREFIX = "profile_pictures"
DEFAULT_REGION = "eu-south-1"

# (content type, extension, magic-byte check)
_IMAGE_SIGNATURES = (
    ("image/jpeg", "jpg", lambda b: b.startswith(b"\xff\xd8\xff")),
    ("image/png", "png", lambda b: b.startswith(b"\x89PNG\r\n\x1a\n")),
    ("image/webp", "webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
)

_s3_client = None


def detect_image_type(content: bytes) -> Optional[tuple]:
    """Return (content_type, extension) from the file's magic bytes, or None if not a supported image."""
    for content_type, extension, matches in _IMAGE_SIGNATURES:
        if matches(content):
            return content_type, extension
    return None


def s3_enabled() -> bool:
    return bool(os.environ.get("S3_BUCKET"))


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        import boto3

        _s3_client = boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION", DEFAULT_REGION),
            endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        )
    return _s3_client


def _public_url(key: str) -> str:
    base = os.environ.get("S3_PUBLIC_BASE_URL", "").rstrip("/")
    if base:
        return f"{base}/{key}"
    bucket = os.environ["S3_BUCKET"]
    region = os.environ.get("AWS_REGION", DEFAULT_REGION)
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


async def save_profile_picture(user_id: str, content: bytes, upload_dir: Path) -> str:
    """Validate and store an image; return the URL (absolute for S3, '/uploads/...' for local disk)."""
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File troppo grande. Massimo 5MB.")
    detected = detect_image_type(content)
    if not detected:
        raise HTTPException(status_code=400, detail="Tipo file non supportato. Usa JPG, PNG o WebP.")
    content_type, extension = detected
    filename = f"{user_id}_{uuid.uuid4().hex[:8]}.{extension}"

    if s3_enabled():
        key = f"{S3_PREFIX}/{filename}"
        try:
            await asyncio.to_thread(
                _get_s3_client().put_object,
                Bucket=os.environ["S3_BUCKET"],
                Key=key,
                Body=content,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable",
            )
        except Exception as exc:  # boto3 raises many error types; surface a single user-facing failure
            raise HTTPException(status_code=502, detail="Caricamento immagine non riuscito. Riprova.") from exc
        return _public_url(key)

    upload_dir.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread((upload_dir / filename).write_bytes, content)
    return f"/uploads/{S3_PREFIX}/{filename}"
