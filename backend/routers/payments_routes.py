"""HTTP routes: payments."""
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
                    "product_data": {"name": "Scambio di Favori — Sostenitore"},
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
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
            await db.users.update_one(
                {"user_id": current_user.user_id},
                {"$set": {
                    "is_supporter": True,
                    "subscription_status": "active",
                    "subscription_id": session_id,
                    "supporter_since": datetime.now(timezone.utc)
                }}
            )

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

@api_router.get("/subscription/my-status")
async def get_my_subscription_status(current_user: User = Depends(get_current_user)):
    """Get current user's supporter subscription status"""
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    
    return {
        "is_supporter": user_doc.get("is_supporter", False),
        "subscription_status": user_doc.get("subscription_status"),
        "supporter_since": user_doc.get("supporter_since"),
        "subscription_id": user_doc.get("subscription_id")
    }

@api_router.get("/subscription/manage-url")
async def get_subscription_manage_url(current_user: User = Depends(get_current_user)):
    """Get Stripe Customer Portal URL for subscription management"""
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    
    if not user_doc.get("is_supporter"):
        raise HTTPException(status_code=400, detail="Non sei ancora un Sostenitore")
    
    # For test mode, return Stripe test portal or a placeholder
    # In production, this would create a real Customer Portal session
    return {
        "manage_url": "https://billing.stripe.com/p/login/test",
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
        metadata = session_obj.get("metadata", {})
        payment_status = session_obj.get("payment_status", "")

        logger.info(f"Stripe webhook: {event_type} - {session_id}")

        if event_type == "checkout.session.completed":
            user_id = metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "is_supporter": True,
                        "subscription_status": "active",
                        "subscription_id": session_id,
                        "supporter_since": datetime.now(timezone.utc)
                    }}
                )
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$addToSet": {"badges": "supporter"}}
                )

        elif event_type in ["customer.subscription.deleted", "invoice.payment_failed"]:
            user_id = metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "is_supporter": False,
                        "subscription_status": "cancelled"
                    }}
                )
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$pull": {"badges": "supporter"}}
                )

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

    except Exception as e:
        logger.error(f"Stripe webhook error: {e}")
        return {"status": "error", "message": str(e)}
