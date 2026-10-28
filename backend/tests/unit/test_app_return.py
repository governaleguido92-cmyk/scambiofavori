"""Stripe return pages: HTTPS landing pages that hand the user back to the mobile app via deep link."""
import pytest

DEEP_LINK = "scambiodifavori://supporter"


@pytest.mark.asyncio
async def test_success_page_deep_links_to_app_with_session_id(client):
    response = await client.get("/supporter/success", params={"session_id": "cs_test_abc123"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert f"{DEEP_LINK}?session_id=cs_test_abc123" in response.text


@pytest.mark.asyncio
async def test_cancel_page_deep_links_to_app_without_session(client):
    response = await client.get("/supporter")

    assert response.status_code == 200
    assert DEEP_LINK in response.text
    assert "session_id" not in response.text


@pytest.mark.asyncio
async def test_session_id_is_not_reflected_unsafely(client):
    payload = '"><script>alert(1)</script>'

    response = await client.get("/supporter/success", params={"session_id": payload})

    assert response.status_code == 200
    assert "<script>" not in response.text
    assert "alert(1)" not in response.text


@pytest.mark.asyncio
async def test_return_pages_are_not_indexed_or_framed(client):
    response = await client.get("/supporter/success", params={"session_id": "cs_test_1"})

    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
