"""HTTP routes: community."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403

api_router = APIRouter(prefix="/api")

# ========================
# CATEGORIES & BADGES
# ========================

@api_router.get("/categories")
async def get_categories():
    return FAVOR_CATEGORIES

@api_router.get("/badges")
async def get_all_badges():
    return list(BADGES.values())

@api_router.get("/badges/progress")
async def get_badge_progress(current_user: User = Depends(get_current_user)):
    """A che punto sei con ogni badge: valore attuale, traguardo, ottenuto, bloccato."""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0}) or {}
    return {"progress": await badge_progress(user_doc)}

@api_router.get("/badges/my")
async def get_my_badges(current_user: User = Depends(get_current_user)):
    earned = []
    for badge_id in current_user.badges:
        if badge_id in BADGES:
            badge = BADGES[badge_id].copy()
            earned.append(badge)
    return earned

# ========================
# ETHICAL TAGS FOR REVIEWS
# ========================

@api_router.get("/ethical-tags")
async def get_ethical_tags():
    """Get all ethical tags for mandatory review screen"""
    return ETHICAL_TAGS

# ========================
# IL NOSTRO PATTO
# ========================

@api_router.get("/patto")
async def get_patto():
    """Get 'Il Nostro Patto' - community guidelines"""
    return PATTO_CONTENT

# ========================
# CURRENCY INFO
# ========================

@api_router.get("/currency")
async def get_currency_info():
    """Get currency (Soli) information"""
    return {
        "name": CURRENCY_NAME,
        "symbol": CURRENCY_SYMBOL,
        "welcome_bonus": WELCOME_GRANELLI,
        "per_hour": GRANELLI_PER_HOUR,
        "referral_bonus": REFERRAL_BONUS,
        "explanation": PATTO_CONTENT["currency_explanation"]
    }

# ========================
# DONATIONS (FONDO SOLIDARIETÀ)
# ========================

@api_router.post("/donations", response_model=Donation)
async def create_donation(donation_data: DonationCreate, current_user: User = Depends(get_current_user)):
    """Donate Soli to solidarity fund or specific user"""
    if donation_data.amount < 1:
        raise HTTPException(status_code=400, detail=f"L'importo deve essere almeno 1 {CURRENCY_NAME[:-1]}e")
    
    if current_user.granelli < donation_data.amount:
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti")
    
    # ========================
    # GAMIFICATION: Check if user has access to Solidarity Fund
    # ========================
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    has_eroe_badge = "eroe_quartiere" in user_doc.get("badges", [])
    can_access_fund = user_doc.get("can_access_solidarity_fund", False) or has_eroe_badge
    
    # Donations to solidarity fund require 5 completed favors (Eroe di Quartiere badge)
    is_solidarity_fund = donation_data.recipient_id is None
    if is_solidarity_fund and not can_access_fund:
        # Il Fondo si apre con il badge «Eroe di Quartiere», che si ottiene aiutando 5 volte (non ricevendo aiuto)
        helped = user_doc.get("total_favors_given", 0)
        missing = max(1, 5 - helped)
        raise HTTPException(
            status_code=403,
            detail=f"Aiuta ancora {missing} {'vicino' if missing == 1 else 'vicini'} (ne servono 5 in tutto) per sbloccare l'accesso al Fondo Solidarietà e diventare 'Eroe di Quartiere'!"
        )
    
    recipient_name = None

    if donation_data.recipient_id:
        if donation_data.recipient_id == current_user.user_id:
            raise HTTPException(status_code=400, detail="Non puoi donare a te stesso")
        recipient = await db.users.find_one({"user_id": donation_data.recipient_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Destinatario non trovato")
        recipient_name = recipient["name"]

    # Addebito atomico: il saldo si controlla nella stessa operazione che lo scala,
    # così richieste parallele non possono spendere due volte gli stessi Granelli.
    debited = await db.users.update_one(
        {"user_id": current_user.user_id, "granelli": {"$gte": donation_data.amount}},
        {"$inc": {"granelli": -donation_data.amount, "total_donations": donation_data.amount}}
    )
    if debited.modified_count == 0:
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti")

    if donation_data.recipient_id:
        await db.users.update_one(
            {"user_id": donation_data.recipient_id},
            {"$inc": {"granelli": donation_data.amount}}
        )

    donation_id = f"donation_{uuid.uuid4().hex[:12]}"
    
    donation_doc = {
        "donation_id": donation_id,
        "donor_id": current_user.user_id,
        "donor_name": current_user.name,
        "recipient_id": donation_data.recipient_id,
        "recipient_name": recipient_name,
        "amount": donation_data.amount,
        "message": donation_data.message,
        "is_solidarity_fund": is_solidarity_fund,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.donations.insert_one(donation_doc)
    
    await check_and_award_badges(current_user.user_id)
    await update_community_score(current_user.user_id)
    
    return Donation(**donation_doc)

@api_router.get("/donations/fund")
async def get_solidarity_fund():
    """Get solidarity fund total"""
    pipeline = [
        {"$match": {"is_solidarity_fund": True}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.donations.aggregate(pipeline).to_list(1)
    total = result[0]["total"] if result else 0
    return {"solidarity_fund_total": total, "currency": CURRENCY_NAME}

@api_router.get("/donations/my")
async def get_my_donations(current_user: User = Depends(get_current_user)):
    donations_cursor = db.donations.find({"donor_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1)
    donations = await donations_cursor.to_list(100)
    return [Donation(**d) for d in donations]

# ========================
# SOCIAL DEBT LIMIT ENDPOINTS
# ========================

@api_router.get("/debt-status")
async def get_debt_status(current_user: User = Depends(get_current_user)):
    """Get user's current debt status"""
    await update_last_activity(current_user.user_id)
    await check_reliability_decay(current_user.user_id)
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    granelli = user_doc.get("granelli", 0)
    
    return {
        "granelli": granelli,
        "in_debt": granelli < 0,
        "can_request": granelli > DEBT_LIMIT,
        "debt_limit": DEBT_LIMIT,
        "reliability_score": user_doc.get("reliability_score", 5.0),
        "in_debt_recovery": user_doc.get("in_debt_recovery", False),
        "message": "Il tuo serbatoio di tempo è vuoto. Offri un piccolo aiuto per ricaricarlo!" if granelli <= DEBT_LIMIT else None
    }

@api_router.post("/debt-recovery/request")
async def request_debt_recovery(current_user: User = Depends(get_current_user)):
    """Request recovery from Solidarity Fund - 'Chiedi un Dono'"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    granelli = user_doc.get("granelli", 0)
    
    if granelli >= 0:
        raise HTTPException(status_code=400, detail="Non sei in debito")
    if user_doc.get("total_favors_given", 0) < 1:
        # Il Fondo è fatto dai Granelli donati dagli altri: si chiede dopo aver aiutato almeno una volta
        raise HTTPException(status_code=403, detail="Il Fondo Solidarietà è per chi ha già aiutato almeno una volta: dai una mano a un vicino e poi riprova.")
    
    if user_doc.get("in_debt_recovery"):
        raise HTTPException(status_code=400, detail="Hai già una richiesta di recupero attiva")
    
    # Check solidarity fund has enough
    pipeline = [
        {"$match": {"is_solidarity_fund": True}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.donations.aggregate(pipeline).to_list(1)
    fund_total = result[0]["total"] if result else 0
    
    debt_amount = abs(granelli)
    recovery_amount = min(debt_amount, 3)  # Max 3 granelli per recovery
    
    if fund_total < recovery_amount:
        raise HTTPException(status_code=400, detail="Fondo Solidarietà insufficiente. Riprova più tardi.")
    
    # Transfer from solidarity fund to user
    # Richiesta atomica: una sola richiesta attiva, anche con chiamate parallele
    claimed = await db.users.update_one(
        {"user_id": current_user.user_id, "granelli": {"$lt": 0}, "in_debt_recovery": {"$ne": True}},
        {
            "$inc": {"granelli": recovery_amount},
            "$set": {"in_debt_recovery": True, "debt_start_date": None}
        }
    )
    if claimed.modified_count == 0:
        raise HTTPException(status_code=400, detail="Hai già una richiesta di recupero attiva")
    
    # Record the gift from community
    gift_doc = {
        "donation_id": f"gift_{uuid.uuid4().hex[:12]}",
        "donor_id": "solidarity_fund",
        "donor_name": "Fondo Solidarietà",
        "recipient_id": current_user.user_id,
        "recipient_name": current_user.name,
        "amount": -recovery_amount,  # Negative to show withdrawal from fund
        "is_solidarity_fund": True,
        "message": f"Dono dalla Community a {current_user.name}",
        "created_at": datetime.now(timezone.utc)
    }
    await db.donations.insert_one(gift_doc)
    
    # Check if user returned to positive
    new_balance = granelli + recovery_amount
    returned_positive = await check_return_to_positive(current_user.user_id, granelli, new_balance)
    
    return {
        "success": True,
        "amount_received": recovery_amount,
        "new_balance": new_balance,
        "returned_positive": returned_positive,
        "message": "La community ti ha fatto un dono! Bentornato tra i sostenitori attivi!" if returned_positive else f"Hai ricevuto {granelli_text(recovery_amount)} dalla community."
    }

@api_router.get("/referral/code")
async def get_my_referral_code(current_user: User = Depends(get_current_user)):
    return {
        "referral_code": current_user.referral_code,
        "successful_referrals": current_user.successful_referrals,
        "bonus_per_referral": REFERRAL_BONUS,
        "currency": CURRENCY_NAME
    }
