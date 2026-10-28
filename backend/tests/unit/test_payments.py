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
