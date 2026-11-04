"""Configurazione pubblica per l'app: dice se la verifica del telefono è obbligatoria."""
from routers import health_routes


async def test_config_says_phone_verification_is_off_by_default(client):
    response = await client.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"phone_verification_required": False}


async def test_config_follows_the_server_flag(client, monkeypatch):
    monkeypatch.setattr(health_routes, "PHONE_VERIFICATION_REQUIRED", True)
    response = await client.get("/api/config")
    assert response.json()["phone_verification_required"] is True


async def test_config_needs_no_login_and_exposes_nothing_else(client):
    response = await client.get("/api/config")
    assert set(response.json()) == {"phone_verification_required"}
