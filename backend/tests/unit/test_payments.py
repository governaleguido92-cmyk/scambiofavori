"""Stripe checkout: amounts must reach Stripe as integer minor units (cents)."""
import pytest

import core
from conftest import auth, make_user
from routers import payments_routes


class FakeSession:
    id = "cs_test_123"
    url = "https://checkout.stripe.com/c/pay/cs_test_123"


@pytest.fixture
def stripe_create(monkeypatch):
    calls = []

    def fake_create(**kwargs):
        calls.append(kwargs)
        return FakeSession()

    monkeypatch.setattr(payments_routes._stripe.checkout.Session, "create", fake_create)
    return calls


@pytest.mark.parametrize("euros, cents", [(1.00, 100), (0.5, 50), (9.99, 999), (19.9, 1990)])
def test_to_minor_units_returns_integer_cents(euros, cents):
    result = core.to_minor_units(euros)
    assert result == cents
    assert isinstance(result, int)


@pytest.mark.asyncio
async def test_create_checkout_sends_integer_cents_to_stripe(client, app_db, stripe_create):
    await app_db.users.insert_one(make_user("payer"))

    response = await client.post(
        "/api/subscription/create-checkout",
        json={"origin_url": "https://app.example.com"},
        headers=auth("payer"),
    )

    assert response.status_code == 200
    unit_amount = stripe_create[0]["line_items"][0]["price_data"]["unit_amount"]
    assert unit_amount == 100
    assert isinstance(unit_amount, int)


@pytest.mark.asyncio
async def test_checkout_is_a_real_monthly_subscription_with_metadata_on_it(client, app_db, stripe_create):
    await app_db.users.insert_one(make_user("payer"))

    await client.post("/api/subscription/create-checkout", json={"origin_url": "https://app.example.com"}, headers=auth("payer"))

    call = stripe_create[0]
    assert call["mode"] == "subscription"
    assert call["line_items"][0]["price_data"]["recurring"] == {"interval": "month"}
    assert call["subscription_data"]["metadata"]["user_id"] == "payer"


@pytest.mark.asyncio
async def test_manage_url_opens_the_stripe_portal_for_the_saved_customer(client, app_db, monkeypatch):
    class Portal:
        url = "https://billing.stripe.com/p/session/test_abc"

    calls = []
    monkeypatch.setattr(payments_routes._stripe.billing_portal.Session, "create", lambda **kw: calls.append(kw) or Portal())
    await app_db.users.insert_one(make_user("sup", is_supporter=True, stripe_customer_id="cus_77"))

    response = await client.get("/api/subscription/manage-url", headers=auth("sup"))

    assert response.status_code == 200
    assert response.json()["manage_url"] == Portal.url
    assert calls[0]["customer"] == "cus_77"


@pytest.mark.asyncio
async def test_manage_url_needs_a_linked_subscription(client, app_db):
    await app_db.users.insert_many([make_user("old", is_supporter=True), make_user("nobody")])

    legacy = await client.get("/api/subscription/manage-url", headers=auth("old"))
    not_supporter = await client.get("/api/subscription/manage-url", headers=auth("nobody"))

    assert legacy.status_code == 400
    assert not_supporter.status_code == 400
