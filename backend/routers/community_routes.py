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

@api_router.get("/object-categories")
async def get_object_categories():
    return OBJECT_CATEGORIES

@api_router.get("/badges")
async def get_all_badges():
    return list(BADGES.values())

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
# MURO DEL QUARTIERE (Neighborhood Wall)
# ========================

@api_router.post("/wall", response_model=WallPost)
async def create_wall_post(post_data: WallPostCreate, current_user: User = Depends(get_current_user)):
    """Create a post on the neighborhood wall"""
    post_id = f"post_{uuid.uuid4().hex[:12]}"
    
    approx_lat, approx_lon = None, None
    if post_data.latitude and post_data.longitude:
        approx_lat, approx_lon = approximate_location(post_data.latitude, post_data.longitude)
    
    post_doc = {
        "post_id": post_id,
        "author_id": current_user.user_id,
        "author_name": current_user.name,
        "author_title": current_user.title,
        "content": post_data.content,
        "post_type": post_data.post_type,
        "likes": 0,
        "liked_by": [],
        "approximate_latitude": approx_lat,
        "approximate_longitude": approx_lon,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.wall_posts.insert_one(post_doc)
    return WallPost(**post_doc)

@api_router.get("/wall", response_model=List[WallPost])
async def get_wall_posts(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: float = 0.5,  # Default 500 meters for hyper-local
    post_type: Optional[str] = None
):
    """Get neighborhood wall posts (hyper-local feed)"""
    query = {}
    if post_type:
        query["post_type"] = post_type
    
    posts_cursor = db.wall_posts.find(query, {"_id": 0}).sort("created_at", -1).limit(50)
    posts = await posts_cursor.to_list(50)
    
    result = []
    for post in posts:
        post_obj = WallPost(**post)
        
        if latitude and longitude and post_obj.approximate_latitude and post_obj.approximate_longitude:
            distance = calculate_distance(latitude, longitude, post_obj.approximate_latitude, post_obj.approximate_longitude)
            post_obj.distance_km = round(distance, 2)
            
            if distance > radius_km:
                continue
        
        result.append(post_obj)
    
    if latitude and longitude:
        result.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return result

@api_router.post("/wall/{post_id}/like")
async def like_wall_post(post_id: str, current_user: User = Depends(get_current_user)):
    """Like/unlike a wall post"""
    post = await db.wall_posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post non trovato")
    
    liked_by = post.get("liked_by", [])
    if current_user.user_id in liked_by:
        # Unlike
        await db.wall_posts.update_one(
            {"post_id": post_id},
            {"$pull": {"liked_by": current_user.user_id}, "$inc": {"likes": -1}}
        )
        return {"liked": False}
    else:
        # Like
        await db.wall_posts.update_one(
            {"post_id": post_id},
            {"$push": {"liked_by": current_user.user_id}, "$inc": {"likes": 1}}
        )
        return {"liked": True}

# ========================
# OGGETTOTECA (Object Lending)
# ========================

@api_router.post("/objects", response_model=LendableObject)
async def create_lendable_object(obj_data: ObjectCreate, current_user: User = Depends(get_current_user)):
    """Add an object to the Oggettoteca"""
    object_id = f"obj_{uuid.uuid4().hex[:12]}"
    
    approx_lat, approx_lon = None, None
    if obj_data.latitude and obj_data.longitude:
        approx_lat, approx_lon = approximate_location(obj_data.latitude, obj_data.longitude)
    
    obj_doc = {
        "object_id": object_id,
        "owner_id": current_user.user_id,
        "owner_name": current_user.name,
        "owner_title": current_user.title,
        "name": obj_data.name,
        "description": obj_data.description,
        "category": obj_data.category,
        "deposit_soli": obj_data.deposit_soli,
        "status": "available",
        "borrowed_by": None,
        "borrowed_by_name": None,
        "approximate_latitude": approx_lat,
        "approximate_longitude": approx_lon,
        "borrow_date": None,
        "return_date": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.objects.insert_one(obj_doc)
    return LendableObject(**obj_doc)

@api_router.get("/objects", response_model=List[LendableObject])
async def get_objects(
    category: Optional[str] = None,
    status: str = "available",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: float = 5.0
):
    """Get lendable objects from Oggettoteca"""
    query = {"status": status}
    if category:
        query["category"] = category
    
    objects_cursor = db.objects.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    objects = await objects_cursor.to_list(100)
    
    result = []
    for obj in objects:
        obj_model = LendableObject(**obj)
        
        if latitude and longitude and obj_model.approximate_latitude and obj_model.approximate_longitude:
            distance = calculate_distance(latitude, longitude, obj_model.approximate_latitude, obj_model.approximate_longitude)
            obj_model.distance_km = round(distance, 2)
            
            if distance > max_distance_km:
                continue
        
        result.append(obj_model)
    
    if latitude and longitude:
        result.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return result

@api_router.get("/objects/my")
async def get_my_objects(current_user: User = Depends(get_current_user)):
    """Get current user's objects"""
    query = {
        "$or": [
            {"owner_id": current_user.user_id},
            {"borrowed_by": current_user.user_id}
        ]
    }
    objects_cursor = db.objects.find(query, {"_id": 0})
    objects = await objects_cursor.to_list(100)
    return [LendableObject(**obj) for obj in objects]

@api_router.post("/objects/borrow")
async def borrow_object(data: BorrowRequest, current_user: User = Depends(get_current_user)):
    """Borrow an object (requires deposit in Soli)"""
    obj = await db.objects.find_one({"object_id": data.object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Oggetto non trovato")
    
    if obj["status"] != "available":
        raise HTTPException(status_code=400, detail="Oggetto non disponibile")
    
    if obj["owner_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi prendere in prestito il tuo oggetto")
    
    if current_user.granelli < obj["deposit_soli"]:
        raise HTTPException(status_code=400, detail=f"Soli insufficienti. Servono {obj['deposit_soli']} {CURRENCY_NAME} come deposito")
    
    # Hold deposit
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$inc": {"granelli": -obj["deposit_soli"]}}
    )
    
    await db.objects.update_one(
        {"object_id": data.object_id},
        {"$set": {
            "status": "borrowed",
            "borrowed_by": current_user.user_id,
            "borrowed_by_name": current_user.name,
            "borrow_date": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": f"Oggetto preso in prestito. {obj['deposit_soli']} {CURRENCY_NAME} trattenuti come deposito."}

@api_router.post("/objects/return")
async def return_object(data: ReturnObject, current_user: User = Depends(get_current_user)):
    """Return a borrowed object"""
    obj = await db.objects.find_one({"object_id": data.object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Oggetto non trovato")
    
    if obj["borrowed_by"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Non hai preso in prestito questo oggetto")
    
    # Return deposit based on condition
    if data.condition == "good":
        # Full deposit back to borrower
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$inc": {"granelli": obj["deposit_soli"]}}
        )
        message = f"Oggetto restituito. {obj['deposit_soli']} {CURRENCY_NAME} restituiti."
    else:
        # Deposit goes to owner as compensation
        await db.users.update_one(
            {"user_id": obj["owner_id"]},
            {"$inc": {"granelli": obj["deposit_soli"]}}
        )
        message = f"Oggetto restituito danneggiato. {obj['deposit_soli']} {CURRENCY_NAME} trasferiti al proprietario."
    
    await db.objects.update_one(
        {"object_id": data.object_id},
        {"$set": {
            "status": "available",
            "borrowed_by": None,
            "borrowed_by_name": None,
            "return_date": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": message}

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
        total_favors = user_doc.get("total_favors_given", 0) + user_doc.get("total_favors_received", 0)
        raise HTTPException(
            status_code=403, 
            detail=f"Completa ancora {5 - total_favors} favori per sbloccare l'accesso al Fondo Solidarietà e diventare 'Eroe di Quartiere'!"
        )
    
    recipient_name = None
    
    if donation_data.recipient_id:
        recipient = await db.users.find_one({"user_id": donation_data.recipient_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Destinatario non trovato")
        recipient_name = recipient["name"]
        
        await db.users.update_one(
            {"user_id": donation_data.recipient_id},
            {"$inc": {"granelli": donation_data.amount}}
        )
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$inc": {"granelli": -donation_data.amount, "total_donations": donation_data.amount}}
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
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {
            "$inc": {"granelli": recovery_amount},
            "$set": {"in_debt_recovery": True, "debt_start_date": None}
        }
    )
    
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
        "message": "La community ti ha fatto un dono! Bentornato tra i sostenitori attivi!" if returned_positive else f"Hai ricevuto {recovery_amount} {CURRENCY_NAME} dalla community."
    }

@api_router.get("/leaderboard")
async def get_leaderboard():
    """Get community leaderboard"""
    users_cursor = db.users.find(
        {},
        {"_id": 0, "user_id": 1, "name": 1, "community_score": 1, "badges": 1, "total_favors_given": 1}
    ).sort("community_score", -1).limit(20)
    users = await users_cursor.to_list(20)
    
    # Add titles
    for user in users:
        user["title"] = get_user_title(user)
    
    return users

@api_router.get("/referral/code")
async def get_my_referral_code(current_user: User = Depends(get_current_user)):
    return {
        "referral_code": current_user.referral_code,
        "successful_referrals": current_user.successful_referrals,
        "bonus_per_referral": REFERRAL_BONUS,
        "currency": CURRENCY_NAME
    }
