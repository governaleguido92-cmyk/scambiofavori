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


class FakeStripeSub:
    def __init__(self, cancel=False):
        self.cancel_at_period_end = cancel
        self.cancel_at = 1796000000 if cancel else None
        self.current_period_end = 1796000000


@pytest.fixture
def stripe_sub(monkeypatch):
    calls = {"modify": []}
    state = {"cancel": False}
    monkeypatch.setattr(payments_routes._stripe.Subscription, "retrieve", lambda sid: FakeStripeSub(state["cancel"]))

    def fake_modify(sid, **kwargs):
        calls["modify"].append((sid, kwargs))
        state["cancel"] = kwargs["cancel_at_period_end"]
        return FakeStripeSub(state["cancel"])

    monkeypatch.setattr(payments_routes._stripe.Subscription, "modify", fake_modify)
    return calls


@pytest.mark.asyncio
async def test_status_shows_renewal_date_and_cancel_state(client, app_db, stripe_sub):
    await app_db.users.insert_one(make_user("sup", is_supporter=True, stripe_subscription_id="sub_1"))

    before = (await client.get("/api/subscription/my-status", headers=auth("sup"))).json()
    await client.post("/api/subscription/cancel", headers=auth("sup"))
    after = (await client.get("/api/subscription/my-status", headers=auth("sup"))).json()

    assert before["can_cancel"] is True and before["cancel_at_period_end"] is False
    assert before["period_end"].startswith("2026-")
    assert after["cancel_at_period_end"] is True


@pytest.mark.asyncio
async def test_cancel_and_resume_call_stripe_for_the_users_own_subscription(client, app_db, stripe_sub):
    await app_db.users.insert_many([
        make_user("sup", is_supporter=True, stripe_subscription_id="sub_mine"),
        make_user("other", is_supporter=True, stripe_subscription_id="sub_other"),
    ])

    cancel = await client.post("/api/subscription/cancel", headers=auth("sup"))
    resume = await client.post("/api/subscription/resume", headers=auth("sup"))

    assert cancel.status_code == 200 and cancel.json()["cancel_at_period_end"] is True
    assert resume.status_code == 200 and resume.json()["cancel_at_period_end"] is False
    assert stripe_sub["modify"] == [("sub_mine", {"cancel_at_period_end": True}), ("sub_mine", {"cancel_at_period_end": False})]


@pytest.mark.asyncio
async def test_cancel_needs_a_linked_subscription_and_login(client, app_db, stripe_sub):
    await app_db.users.insert_many([make_user("old", is_supporter=True), make_user("nobody")])

    assert (await client.post("/api/subscription/cancel")).status_code == 401
    assert (await client.post("/api/subscription/cancel", headers=auth("old"))).status_code == 400
    assert (await client.post("/api/subscription/cancel", headers=auth("nobody"))).status_code == 400
    assert stripe_sub["modify"] == []


@pytest.mark.asyncio
async def test_cancel_reports_stripe_errors_without_details(client, app_db, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret detail")

    monkeypatch.setattr(payments_routes._stripe.Subscription, "modify", boom)
    await app_db.users.insert_one(make_user("sup", is_supporter=True, stripe_subscription_id="sub_1"))

    response = await client.post("/api/subscription/cancel", headers=auth("sup"))

    assert response.status_code == 502
    assert "secret detail" not in response.text


@pytest.mark.asyncio
async def test_status_survives_a_stripe_outage(client, app_db, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("down")

    monkeypatch.setattr(payments_routes._stripe.Subscription, "retrieve", boom)
    await app_db.users.insert_one(make_user("sup", is_supporter=True, stripe_subscription_id="sub_1"))

    response = await client.get("/api/subscription/my-status", headers=auth("sup"))

    assert response.status_code == 200
    assert response.json()["is_supporter"] is True and response.json()["can_cancel"] is False
