"""Offline fixtures: the real FastAPI app wired to an in-memory MongoDB (mongomock-motor)."""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("UPLOAD_PATH", "/tmp/scambiofavori-test-uploads")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import core  # noqa: E402
import server  # noqa: E402


@pytest_asyncio.fixture
async def app_db(monkeypatch):
    mock_db = AsyncMongoMockClient()["unit_test_db"]
    monkeypatch.setattr(core.db, "_database", mock_db)
    core.limiter.reset()
    monkeypatch.setattr(core.limiter, "enabled", False)  # opt in per test via the `rate_limited` fixture
    return mock_db


@pytest.fixture
def rate_limited(monkeypatch):
    monkeypatch.setattr(core.limiter, "enabled", True)


@pytest_asyncio.fixture
async def client(app_db):
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


def make_user(user_id: str, email: str | None = None, granelli: int = 10, **extra) -> dict:
    return {
        "user_id": user_id,
        "email": email or f"{user_id}@example.com",
        "name": user_id,
        "granelli": granelli,
        "created_at": datetime.now(timezone.utc),
        **extra,
    }


def make_favor(favor_id: str = "favor_1", **extra) -> dict:
    base = {
        "favor_id": favor_id,
        "creator_id": "creator",
        "creator_name": "creator",
        "type": "request",
        "title": "Aiuto spesa",
        "description": "Portare la spesa",
        "category": "Spesa",
        "duration_hours": 1.0,
        "granelli_cost": 3,
        "status": "accepted",
        "accepted_by": "helper",
        "accepted_by_name": "helper",
        "qr_code": "secretqrtoken123",
        "created_at": datetime.now(timezone.utc),
    }
    return {**base, **extra}


def auth(user_id: str) -> dict:
    return {"Authorization": f"Bearer {core.create_jwt_token(user_id)}"}


@pytest.fixture
def new_id():
    return lambda prefix="id": f"{prefix}_{uuid.uuid4().hex[:8]}"
