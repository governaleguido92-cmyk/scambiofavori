"""HTTP routes: payments."""
import asyncio
from typing import Optional

from fastapi import APIRouter
from core import *  # noqa: F401,F403
from core import _stripe  # noqa: F401

api_router = APIRouter(prefix="/api")

@api_router.post("/subscription/create-checkout")
async def create_subscription_checkout(
    request: Request,
    checkout_req: SubscriptionCheckoutRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a Stripe checkout session for supporter subscription"""
    
    # Check if user is already a supporter
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if user_doc.get("is_supporter") and user_doc.get("subscription_status") == "active":
        raise HTTPException(status_code=400, detail="Sei già un Sostenitore! Grazie per il tuo supporto.")
    
    # Build success and cancel URLs from frontend origin
    success_url = f"{checkout_req.origin_url}/supporter/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout_req.origin_url}/supporter"
    
    # Initialize Stripe
    _stripe.api_key = STRIPE_API_KEY

    metadata = {
        "user_id": current_user.user_id,
        "user_email": current_user.email,
        "plan_id": SUPPORTER_PLAN["id"],
        "subscription_type": "supporter_monthly"
    }

    try:
        session = _stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": SUPPORTER_PLAN["currency"],
                    "unit_amount": to_minor_units(SUPPORTER_PLAN["amount"]),
                    "product_data": {"name": "Scambio Favori — Sostenitore"},
                    "recurring": {"interval": SUPPORTER_PLAN["interval"]},
                },
                "quantity": 1,
            }],
            # Abbonamento mensile vero: si rinnova da solo e si disdice dal portale Stripe.
            # I metadata vanno anche sull'abbonamento, così gli eventi di Stripe riconoscono l'utente.
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            subscription_data={"metadata": metadata},
        )

        # Create payment transaction record
        transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
        transaction_doc = {
            "transaction_id": transaction_id,
            "session_id": session.id,
            "user_id": current_user.user_id,
            "user_email": current_user.email,
            "amount": SUPPORTER_PLAN["amount"],
            "currency": SUPPORTER_PLAN["currency"],
            "plan_id": SUPPORTER_PLAN["id"],
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc)
        }
        await db.payment_transactions.insert_one(transaction_doc)

        return {
            "checkout_url": session.url,
            "session_id": session.id
        }
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Errore nella creazione del checkout. Riprova più tardi.")

@api_router.get("/subscription/status/{session_id}")
async def get_checkout_status(
    request: Request,
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Poll for checkout session status and update user supporter status"""
    
    # Verify this session belongs to the user
    transaction = await db.payment_transactions.find_one({
        "session_id": session_id,
        "user_id": current_user.user_id
    }, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Sessione di pagamento non trovata")
    
    # Check if already processed
    if transaction.get("payment_status") == "paid":
        return {
            "status": "complete",
            "payment_status": "paid",
            "message": "Pagamento già elaborato. Sei ufficialmente un Sostenitore!"
        }
    
    # Poll Stripe for status
    _stripe.api_key = STRIPE_API_KEY

    try:
        session_obj = _stripe.checkout.Session.retrieve(session_id)
        payment_status = session_obj.payment_status  # "paid", "unpaid", "no_payment_required"
        status_val = session_obj.status  # "open", "complete", "expired"

        # Update transaction record
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": payment_status,
                "status": status_val,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        # If payment successful, update user as supporter
        if payment_status == "paid":
            supporter_fields = {
                "is_supporter": True,
                "subscription_status": "active",
                "subscription_id": session_id,
                "supporter_since": datetime.now(timezone.utc)
            }
            # I codici Stripe servono per disdire, per il portale e per riconoscere gli eventi di revoca
            stripe_subscription = getattr(session_obj, "subscription", None)
            stripe_customer = getattr(session_obj, "customer", None)
            if isinstance(stripe_subscription, str):
                supporter_fields["stripe_subscription_id"] = stripe_subscription
            if isinstance(stripe_customer, str):
                supporter_fields["stripe_customer_id"] = stripe_customer
            await db.users.update_one({"user_id": current_user.user_id}, {"$set": supporter_fields})

            # Add supporter badge
            await db.users.update_one(
                {"user_id": current_user.user_id},
                {"$addToSet": {"badges": "supporter"}}
            )

            return {
                "status": status_val,
                "payment_status": payment_status,
                "message": "Grazie! Sei ufficialmente un Sostenitore. Da oggi il tuo profilo brillerà sulla mappa!",
                "is_supporter": True
            }

        return {
            "status": status_val,
            "payment_status": payment_status,
            "message": "Pagamento in elaborazione..." if status_val != "expired" else "Sessione scaduta"
        }

    except Exception as e:
        logger.error(f"Stripe status check error: {e}")
        raise HTTPException(status_code=500, detail="Errore nel controllo dello stato del pagamento")

def _subscription_period_end(stripe_sub) -> Optional[int]:
    """Fine del periodo pagato: nelle API recenti sta sugli elementi dell'abbonamento, in quelle vecchie sull'abbonamento."""
    end = getattr(stripe_sub, "cancel_at", None) if getattr(stripe_sub, "cancel_at_period_end", False) else None
    if end:
        return end
    end = getattr(stripe_sub, "current_period_end", None)
    if end:
        return end
    try:
        return stripe_sub["items"]["data"][0]["current_period_end"]
    except (KeyError, IndexError, TypeError, AttributeError):
        return None


def _iso_from_timestamp(timestamp: Optional[int]) -> Optional[str]:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp else None


async def _stripe_call(function, *args, **kwargs):
    """Chiamata Stripe (bloccante) fuori dal ciclo degli eventi, così il server non si ferma mentre aspetta."""
    _stripe.api_key = STRIPE_API_KEY
    return await asyncio.to_thread(function, *args, **kwargs)


@api_router.get("/subscription/my-status")
async def get_my_subscription_status(current_user: User = Depends(get_current_user)):
    """Stato dell'abbonamento Sostenitore, con data di rinnovo o di fine se disdetto."""

    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    status = {
        "is_supporter": user_doc.get("is_supporter", False),
        "subscription_status": user_doc.get("subscription_status"),
        "supporter_since": user_doc.get("supporter_since"),
        "subscription_id": user_doc.get("subscription_id"),
        "can_cancel": False,
        "cancel_at_period_end": False,
        "period_end": None,
    }
    subscription_id = user_doc.get("stripe_subscription_id")
    if status["is_supporter"] and subscription_id:
        try:
            stripe_sub = await _stripe_call(_stripe.Subscription.retrieve, subscription_id)
            status["can_cancel"] = True
            status["cancel_at_period_end"] = bool(getattr(stripe_sub, "cancel_at_period_end", False))
            status["period_end"] = _iso_from_timestamp(_subscription_period_end(stripe_sub))
        except Exception:
            # Stripe non risponde: si mostra lo stato salvato, senza date
            logger.exception("Stripe subscription lookup failed")
    return status


async def _linked_subscription_id(user_id: str) -> str:
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc.get("is_supporter"):
        raise HTTPException(status_code=400, detail="Non sei ancora un Sostenitore")
    subscription_id = user_doc.get("stripe_subscription_id")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Nessun abbonamento collegato: se hai appena pagato, riprova tra qualche minuto")
    return subscription_id


async def _set_cancel_at_period_end(user_id: str, cancel: bool) -> dict:
    subscription_id = await _linked_subscription_id(user_id)
    try:
        stripe_sub = await _stripe_call(_stripe.Subscription.modify, subscription_id, cancel_at_period_end=cancel)
    except Exception:
        logger.exception("Stripe subscription update failed")
        raise HTTPException(status_code=502, detail="Non riesco a contattare il servizio di pagamento. Riprova tra poco.")
    return {
        "cancel_at_period_end": bool(getattr(stripe_sub, "cancel_at_period_end", cancel)),
        "period_end": _iso_from_timestamp(_subscription_period_end(stripe_sub)),
    }


@api_router.post("/subscription/cancel")
async def cancel_subscription(current_user: User = Depends(get_current_user)):
    """Disdice l'abbonamento a fine periodo: resta Sostenitore fino all'ultimo giorno pagato, poi niente più addebiti."""
    return await _set_cancel_at_period_end(current_user.user_id, True)


@api_router.post("/subscription/resume")
async def resume_subscription(current_user: User = Depends(get_current_user)):
    """Annulla la disdetta: l'abbonamento continua a rinnovarsi."""
    return await _set_cancel_at_period_end(current_user.user_id, False)

@api_router.get("/subscription/manage-url")
async def get_subscription_manage_url(current_user: User = Depends(get_current_user)):
    """Get Stripe Customer Portal URL for subscription management"""
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    
    if not user_doc.get("is_supporter"):
        raise HTTPException(status_code=400, detail="Non sei ancora un Sostenitore")
    
    customer_id = user_doc.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Nessun abbonamento collegato: se hai appena pagato, riprova tra qualche minuto")

    # Portale cliente di Stripe: da lì il Sostenitore cambia carta o disdice l'abbonamento
    _stripe.api_key = STRIPE_API_KEY
    try:
        portal = _stripe.billing_portal.Session.create(customer=customer_id, return_url="https://scambiofavori.it")
    except Exception:
        logger.exception("Stripe portal error")
        raise HTTPException(status_code=502, detail="Portale abbonamento non disponibile al momento")
    return {
        "manage_url": portal.url,
        "message": "Usa il portale Stripe per gestire il tuo abbonamento"
    }

@api_router.post("/webhook/stripe")
async def handle_stripe_webhook(request: Request):
    """Handle Stripe webhooks for subscription events"""
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook rejected: STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=503, detail="Webhook non configurato")
    if not signature:
        raise HTTPException(status_code=400, detail="Firma mancante")
    try:
        _stripe.api_key = STRIPE_API_KEY
        event = _stripe.Webhook.construct_event(body, signature, STRIPE_WEBHOOK_SECRET)
    except (ValueError, _stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Firma non valida")

    try:
        event_type = event["type"]
        session_obj = event["data"]["object"]
        session_id = session_obj.get("id", "")
        metadata = session_obj.get("metadata") or {}
        payment_status = session_obj.get("payment_status", "")

        logger.info(f"Stripe webhook: {event_type} - {session_id}")

        if event_type == "checkout.session.completed":
            user_id = metadata.get("user_id")
            if user_id:
                update = {
                    "is_supporter": True,
                    "subscription_status": "active",
                    "subscription_id": session_id,
                    "supporter_since": datetime.now(timezone.utc),
                }
                # Gli eventi di revoca (disdetta, pagamento fallito) non portano i nostri metadata:
                # si ritrova l'utente tramite i codici Stripe di abbonamento e cliente salvati qui.
                if session_obj.get("subscription"):
                    update["stripe_subscription_id"] = session_obj["subscription"]
                if session_obj.get("customer"):
                    update["stripe_customer_id"] = session_obj["customer"]
                await db.users.update_one({"user_id": user_id}, {"$set": update, "$addToSet": {"badges": "supporter"}})

        elif event_type in ["customer.subscription.deleted", "invoice.payment_failed"]:
            user_id = await find_supporter_user_id(event_type, session_obj, metadata)
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"is_supporter": False, "subscription_status": "cancelled"},
                     "$pull": {"badges": "supporter"}},
                )
            else:
                logger.warning(f"Stripe webhook {event_type}: nessun utente collegato")

        # Update payment transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": payment_status,
                "event_type": event_type,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        return {"status": "success"}

    except Exception:
        # Errore vero (non 200): così Stripe riprova l'evento. Il dettaglio resta nei log, non nella risposta.
        logger.exception("Stripe webhook error")
        raise HTTPException(status_code=500, detail="Errore nell'elaborazione dell'evento")


async def find_supporter_user_id(event_type: str, stripe_object: dict, metadata: dict):
    """L'utente di un evento di revoca: prima i metadata, poi l'abbonamento, poi il cliente Stripe."""
    if metadata.get("user_id"):
        return metadata["user_id"]
    subscription_id = stripe_object.get("id") if event_type == "customer.subscription.deleted" else stripe_object.get("subscription")
    customer_id = stripe_object.get("customer")
    for field, value in (("stripe_subscription_id", subscription_id), ("stripe_customer_id", customer_id)):
        if value:
            user = await db.users.find_one({field: value}, {"_id": 0, "user_id": 1})
            if user:
                return user["user_id"]
    return None
