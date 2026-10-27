"""HTTP routes: favors."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403

api_router = APIRouter(prefix="/api")

# ========================
# FAVORS ENDPOINTS
# ========================

@api_router.post("/favors", response_model=Favor, response_model_exclude={"qr_code"})
async def create_favor(favor_data: FavorCreate, current_user: User = Depends(get_current_user)):
    """Create a new favor"""
    if favor_data.type not in ["offer", "request"]:
        raise HTTPException(status_code=400, detail="Tipo deve essere 'offer' o 'request'")
    
    # ========================
    # CONTENT MODERATION (Store Compliance)
    # ========================
    content_to_check = f"{favor_data.title} {favor_data.description}"
    moderation_result = moderate_content(content_to_check)
    if not moderation_result["allowed"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Contenuto non consentito: {moderation_result['reason']}. Modifica il testo e riprova."
        )
    
    granelli_cost = max(1, int(favor_data.duration_hours * GRANELLI_PER_HOUR))
    
    # ========================
    # SOCIAL DEBT LIMIT CHECK
    # ========================
    if favor_data.type == "request":
        debt_status = await check_debt_status(current_user.user_id)
        if not debt_status["can_request"]:
            raise HTTPException(
                status_code=403, 
                detail="Il tuo serbatoio di tempo è vuoto. Offri un piccolo aiuto per ricaricarlo!",
                headers={"X-Debt-Block": "true", "X-Debt-Limit": str(DEBT_LIMIT)}
            )
        if current_user.granelli < granelli_cost:
            raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti")
    
    # Update last activity
    await update_last_activity(current_user.user_id)
    
    favor_id = f"favor_{uuid.uuid4().hex[:12]}"
    qr_code = generate_qr_code()
    
    # Privacy: create approximate location
    approx_lat, approx_lon = None, None
    if favor_data.latitude and favor_data.longitude:
        approx_lat, approx_lon = approximate_location(favor_data.latitude, favor_data.longitude)
    
    # Check if user is in debt (for priority highlighting)
    creator_in_debt = current_user.granelli < 0
    
    # Validazione durata annuncio (1-10 giorni)
    validity_days = max(1, min(10, favor_data.validity_days))
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(days=validity_days)
    
    favor_doc = {
        "favor_id": favor_id,
        "creator_id": current_user.user_id,
        "creator_name": current_user.name,
        "creator_title": current_user.title,
        "type": favor_data.type,
        "title": favor_data.title,
        "description": favor_data.description,
        "category": favor_data.category,
        "duration_hours": favor_data.duration_hours,
        "granelli_cost": granelli_cost,
        "validity_days": validity_days,
        "expires_at": expires_at,
        "status": "active",
        "accepted_by": None,
        "accepted_by_name": None,
        "approximate_latitude": approx_lat,
        "approximate_longitude": approx_lon,
        "exact_latitude": favor_data.latitude,
        "exact_longitude": favor_data.longitude,
        "address": favor_data.address,
        "is_emergency": favor_data.is_emergency,
        "creator_in_debt": creator_in_debt,  # For priority highlighting
        "qr_code": qr_code,
        "checkin_completed": False,
        "created_at": created_at,
        "completed_at": None
    }
    
    await db.favors.insert_one(favor_doc)
    
    # Invia notifiche agli utenti con competenze corrispondenti (solo per richieste)
    if favor_data.type == "request":
        await create_skill_match_notifications(favor_doc)
    
    # For public response, hide exact location
    favor_doc["exact_latitude"] = None
    favor_doc["exact_longitude"] = None
    
    return Favor(**favor_doc)

@api_router.get("/favors", response_model=List[Favor], response_model_exclude={"__all__": {"qr_code"}})
async def get_favors(
    type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "active",
    is_emergency: Optional[bool] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: Optional[float] = None
):
    """Get favors (uses approximate location for privacy)"""
    query = {"status": status}
    
    # Filtra annunci scaduti (solo per status active)
    if status == "active":
        now = datetime.now(timezone.utc)
        query["$or"] = [
            {"expires_at": {"$gt": now}},  # Non ancora scaduto
            {"expires_at": None},           # Vecchi annunci senza scadenza
            {"expires_at": {"$exists": False}}  # Compatibilità con dati esistenti
        ]
    
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if is_emergency is not None:
        query["is_emergency"] = is_emergency
    
    # Sort emergencies first
    sort_order = [("is_emergency", -1), ("created_at", -1)]
    
    favors_cursor = db.favors.find(query, {"_id": 0, "exact_latitude": 0, "exact_longitude": 0}).sort(sort_order).limit(100)
    favors = await favors_cursor.to_list(100)
    
    # Get all unique creator IDs to batch check supporter status
    creator_ids = list(set(f.get("creator_id") for f in favors if f.get("creator_id")))
    
    # Batch fetch supporter status for all creators
    supporter_status = {}
    if creator_ids:
        creators_cursor = db.users.find(
            {"user_id": {"$in": creator_ids}},
            {"_id": 0, "user_id": 1, "is_supporter": 1, "subscription_status": 1}
        )
        async for creator in creators_cursor:
            is_supporter = creator.get("is_supporter", False) and creator.get("subscription_status") == "active"
            supporter_status[creator["user_id"]] = is_supporter
    
    result = []
    for favor in favors:
        # Imposta valori di default per campi nuovi
        favor.setdefault("validity_days", 3)
        favor.setdefault("expires_at", None)
        # Add supporter status from batch lookup
        favor["creator_is_supporter"] = supporter_status.get(favor.get("creator_id"), False)
        favor_obj = Favor(**favor)
        
        if latitude and longitude and favor_obj.approximate_latitude and favor_obj.approximate_longitude:
            distance = calculate_distance(latitude, longitude, favor_obj.approximate_latitude, favor_obj.approximate_longitude)
            favor_obj.distance_km = round(distance, 2)
            
            if max_distance_km and distance > max_distance_km:
                continue
        
        result.append(favor_obj)
    
    if latitude and longitude:
        result.sort(key=lambda x: (not x.is_emergency, x.distance_km if x.distance_km else float('inf')))
    
    return result

@api_router.get("/favors/emergencies", response_model=List[Favor], response_model_exclude={"__all__": {"qr_code"}})
async def get_emergencies(
    latitude: float,
    longitude: float,
    current_user: User = Depends(get_current_user)
):
    """Get nearby emergency requests (for notifications)"""
    query = {"status": "active", "is_emergency": True}
    
    favors_cursor = db.favors.find(query, {"_id": 0, "exact_latitude": 0, "exact_longitude": 0, "qr_code": 0})
    favors = await favors_cursor.to_list(50)
    
    nearby = []
    for favor in favors:
        if favor.get("approximate_latitude") and favor.get("approximate_longitude"):
            distance = calculate_distance(latitude, longitude, favor["approximate_latitude"], favor["approximate_longitude"])
            if distance <= 2.0:  # Within 2km
                favor["distance_km"] = round(distance, 2)
                nearby.append(Favor(**favor))
    
    # Sort by distance
    nearby.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return nearby[:10]  # Return top 10 nearest

@api_router.get("/favors/my", response_model=List[Favor], response_model_exclude={"__all__": {"qr_code"}})
async def get_my_favors(current_user: User = Depends(get_current_user)):
    """Get current user's favors (includes exact location for own favors)"""
    query = {
        "$or": [
            {"creator_id": current_user.user_id},
            {"accepted_by": current_user.user_id}
        ]
    }
    
    favors_cursor = db.favors.find(query, {"_id": 0}).sort("created_at", -1)
    favors = await favors_cursor.to_list(100)
    
    return [Favor(**favor) for favor in favors]

@api_router.get("/favors/{favor_id}/qr-image")
async def get_favor_qr_image(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get QR code image for favor completion"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    # Only the payer (who receives the service) may display the QR; the helper scans it
    payer_id = favor_doc["creator_id"] if favor_doc["type"] == "request" else favor_doc.get("accepted_by")
    if payer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo chi riceve il servizio può mostrare il QR code")
    
    # Check favor status
    if favor_doc["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Il QR code è disponibile solo per favori accettati")
    
    # Generate QR image
    qr_code = favor_doc.get("qr_code")
    if not qr_code:
        raise HTTPException(status_code=404, detail="QR code non trovato")
    
    qr_image = generate_qr_image(qr_code, favor_id)
    
    return {
        "qr_code": qr_code,
        "qr_image": qr_image,
        "favor_id": favor_id,
        "favor_title": favor_doc.get("title"),
        "instructions": "Mostra questo QR code all'altra persona per completare il favore"
    }

@api_router.get("/favors/{favor_id}", response_model=Favor, response_model_exclude={"qr_code"})
async def get_favor(favor_id: str, request: Request):
    """Get a specific favor"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    # Check if user is involved to show exact location
    try:
        current_user = await get_current_user(request)
        is_involved = favor_doc["creator_id"] == current_user.user_id or favor_doc.get("accepted_by") == current_user.user_id
        
        if not is_involved:
            favor_doc["exact_latitude"] = None
            favor_doc["exact_longitude"] = None
    except:
        favor_doc["exact_latitude"] = None
        favor_doc["exact_longitude"] = None
    
    return Favor(**favor_doc)

@api_router.post("/favors/accept", response_model=Favor, response_model_exclude={"qr_code"})
async def accept_favor(data: FavorAccept, current_user: User = Depends(get_current_user)):
    """Accept a favor (reveals exact location)"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")

    favor = Favor(**favor_doc)

    if favor.creator_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi accettare il tuo stesso favore")

    if favor.type == "offer" and current_user.granelli < favor.granelli_cost:
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti per accettare questo favore")

    # Atomic check-and-set: filter su status="active" previene double-accept concorrente
    updated = await db.favors.find_one_and_update(
        {"favor_id": data.favor_id, "status": "active"},
        {"$set": {
            "status": "accepted",
            "accepted_by": current_user.user_id,
            "accepted_by_name": current_user.name
        }},
        return_document=True,
        projection={"_id": 0}
    )

    if not updated:
        raise HTTPException(status_code=400, detail="Il favore non è più disponibile")

    favor_doc = updated
    
    # Push notification to the favor creator
    await send_push_notification(
        favor.creator_id,
        "Favore Accettato!",
        f"{current_user.name} ha accettato il tuo favore \"{favor.title}\"",
        {"favor_id": data.favor_id, "type": "favor_accepted"}
    )
    
    return Favor(**favor_doc)

@api_router.post("/favors/complete", response_model=Favor, response_model_exclude={"qr_code"})
async def complete_favor(data: FavorComplete, current_user: User = Depends(get_current_user)):
    """Complete a favor and transfer Soli"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accepted'")
    
    _, payer_id = favor_parties(favor)
    if payer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo chi riceve il servizio può confermare il completamento")
    
    # ========================
    # ANTI-FRAUD: Daily Hours Limit Check
    # ========================
    for user_id in [favor.creator_id, favor.accepted_by]:
        daily_check = await check_daily_hours_limit(user_id)
        if daily_check["limit_exceeded"]:
            raise HTTPException(
                status_code=403,
                detail=f"Limite giornaliero di {MAX_DAILY_HOURS} ore raggiunto. Riprova domani."
            )
        if daily_check["remaining_hours"] < favor.duration_hours:
            raise HTTPException(
                status_code=403,
                detail=f"Ore rimanenti oggi: {daily_check['remaining_hours']:.1f}h. Questo favore richiede {favor.duration_hours}h."
            )
    
    # ========================
    # PROXIMITY CHECK (100m) - Geofencing
    # ========================
    if data.latitude is not None and data.longitude is not None:
        # Get the other user's last known location from the favor
        if favor.exact_latitude is not None and favor.exact_longitude is not None:
            distance_km = calculate_distance(
                data.latitude, data.longitude,
                favor.exact_latitude, favor.exact_longitude
            )
            distance_m = distance_km * 1000  # Convert km to meters
            
            if distance_m > MAX_EXCHANGE_DISTANCE_METERS:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Siete troppo lontani per confermare lo scambio ({int(distance_m)}m). Avvicinatevi entro {MAX_EXCHANGE_DISTANCE_METERS}m."
                )
    
    helper_id, _ = await settle_favor(favor)

    # Update emergency counts
    if favor.is_emergency:
        await db.users.update_one(
            {"user_id": helper_id},
            {"$inc": {"emergencies_helped": 1}}
        )
    
    # ========================
    # SECURITY LOG: Record transaction for legal purposes
    # ========================
    await log_security_transaction(
        favor_id=favor.favor_id,
        creator_id=favor.creator_id,
        accepted_by=favor.accepted_by,
        duration_hours=favor.duration_hours,
        granelli_cost=favor.granelli_cost,
        latitude=data.latitude,
        longitude=data.longitude,
        qr_code=data.qr_code if hasattr(data, 'qr_code') else None
    )
    
    # Handle referral bonus
    for user_id in [favor.creator_id, favor.accepted_by]:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user and user.get("referred_by"):
            total_favors = user.get("total_favors_given", 0) + user.get("total_favors_received", 0)
            if total_favors == 1:
                await db.users.update_one(
                    {"user_id": user["referred_by"]},
                    {"$inc": {"granelli": REFERRAL_BONUS, "successful_referrals": 1}}
                )
                await check_and_award_badges(user["referred_by"])
                await update_community_score(user["referred_by"])
    
    # Check badges
    await check_and_award_badges(favor.creator_id)
    await check_and_award_badges(favor.accepted_by)
    await update_community_score(favor.creator_id)
    await update_community_score(favor.accepted_by)
    
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    return Favor(**favor_doc)

@api_router.delete("/favors/{favor_id}")
async def cancel_favor(favor_id: str, current_user: User = Depends(get_current_user)):
    """Cancel a favor"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    if favor_doc["creator_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo il creatore può cancellare il favore")
    
    if favor_doc["status"] == "completed":
        raise HTTPException(status_code=400, detail="Non puoi cancellare un favore completato")
    
    await db.favors.update_one(
        {"favor_id": favor_id},
        {"$set": {"status": "cancelled"}}
    )
    
    return {"message": "Favore cancellato"}

@api_router.post("/favors/{favor_id}/verify-qr")
async def verify_and_complete_qr(
    favor_id: str, 
    data: QRVerifyRequest,
    current_user: User = Depends(get_current_user)
):
    """Verify QR code scanned and complete the favor"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accepted'")
    
    # Solo chi ESEGUE il favore scansiona il QR mostrato da chi lo riceve (e paga)
    helper_expected, _ = favor_parties(favor)
    if current_user.user_id != helper_expected:
        raise HTTPException(status_code=403, detail="Solo chi esegue il favore può scansionare il QR")
    
    # Verifica che il QR code sia corretto
    # Il QR code scansionato può essere il JSON payload o direttamente il codice
    scanned_code = data.qr_code
    
    # Il QR contiene il payload str(dict) con "'code': '<token>'"; accetta anche il token nudo
    match = re.search(r"""['"]code['"]\s*:\s*['"]([A-Za-z0-9_-]+)['"]""", scanned_code)
    if match:
        scanned_code = match.group(1)

    if not favor.qr_code or not secrets.compare_digest(scanned_code, favor.qr_code):
        raise HTTPException(status_code=400, detail="QR code non valido")
    
    # ========================
    # ANTI-FRAUD: Daily Hours Limit Check
    # ========================
    for user_id in [favor.creator_id, favor.accepted_by]:
        daily_check = await check_daily_hours_limit(user_id)
        if daily_check["limit_exceeded"]:
            raise HTTPException(
                status_code=403,
                detail=f"Limite giornaliero di {MAX_DAILY_HOURS} ore raggiunto. Riprova domani."
            )
    
    helper_id, receiver_id = await settle_favor(favor, {"checkin_completed": True})

    # Update emergency counts
    if favor.is_emergency:
        await db.users.update_one(
            {"user_id": helper_id},
            {"$inc": {"emergencies_helped": 1}}
        )
    
    # Create transaction record for security/legal purposes
    await log_security_transaction(
        favor_id=favor.favor_id,
        creator_id=favor.creator_id,
        accepted_by=favor.accepted_by,
        duration_hours=favor.duration_hours,
        granelli_cost=favor.granelli_cost
    )
    
    # ========================
    # NOTIFICATIONS TO BOTH USERS
    # ========================
    # Notification to helper
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": helper_id,
        "type": "favor_completed",
        "title": "Favore Completato! 🎉",
        "message": f"Hai completato \"{favor.title}\" e guadagnato {favor.granelli_cost} {CURRENCY_NAME}!",
        "related_id": favor_id,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Notification to receiver
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": receiver_id,
        "type": "favor_completed",
        "title": "Favore Completato! 🎉",
        "message": f"Il favore \"{favor.title}\" è stato completato. Grazie per aver usato Scambio di Favori!",
        "related_id": favor_id,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Push notifications for completion
    await send_push_notification(
        helper_id,
        "Favore Completato!",
        f"Hai completato \"{favor.title}\" e guadagnato {favor.granelli_cost} {CURRENCY_NAME}!",
        {"favor_id": favor_id, "type": "favor_completed"}
    )
    await send_push_notification(
        receiver_id,
        "Favore Completato!",
        f"Il favore \"{favor.title}\" è stato completato!",
        {"favor_id": favor_id, "type": "favor_completed"}
    )
    
    # Check badges
    await check_and_award_badges(favor.creator_id)
    await check_and_award_badges(favor.accepted_by)
    await update_community_score(favor.creator_id)
    await update_community_score(favor.accepted_by)
    
    return {
        "message": "Favore completato con successo!",
        "favor_id": favor_id,
        "granelli_earned": favor.granelli_cost
    }

# ========================
# REVIEWS & BACHECA DEI GRAZIE
# ========================

@api_router.post("/reviews", response_model=Review)
async def create_review(review_data: ReviewCreate, current_user: User = Depends(get_current_user)):
    """Create a review with optional public thanks"""
    favor_doc = await db.favors.find_one({"favor_id": review_data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    if favor_doc["status"] != "completed":
        raise HTTPException(status_code=400, detail="Puoi recensire solo favori completati")
    
    if current_user.user_id == favor_doc["creator_id"]:
        reviewed_id = favor_doc["accepted_by"]
    elif current_user.user_id == favor_doc["accepted_by"]:
        reviewed_id = favor_doc["creator_id"]
    else:
        raise HTTPException(status_code=403, detail="Non puoi recensire questo favore")
    
    existing = await db.reviews.find_one({
        "favor_id": review_data.favor_id,
        "reviewer_id": current_user.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hai già recensito questo favore")
    
    for rating in [review_data.rating, review_data.kindness_rating, review_data.impact_rating]:
        if rating < 1 or rating > 5:
            raise HTTPException(status_code=400, detail="I rating devono essere tra 1 e 5")
    
    review_id = f"review_{uuid.uuid4().hex[:12]}"
    
    review_doc = {
        "review_id": review_id,
        "favor_id": review_data.favor_id,
        "reviewer_id": current_user.user_id,
        "reviewer_name": current_user.name,
        "reviewed_id": reviewed_id,
        "rating": review_data.rating,
        "kindness_rating": review_data.kindness_rating,
        "impact_rating": review_data.impact_rating,
        "ethical_tags": review_data.ethical_tags,
        "comment": review_data.comment,
        "public_thanks": review_data.public_thanks,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.reviews.insert_one(review_doc)
    
    # Add to Bacheca dei Grazie if public thanks provided
    if review_data.public_thanks:
        reviewed_user = await db.users.find_one({"user_id": reviewed_id}, {"_id": 0})
        thanks_doc = {
            "thanks_id": f"thanks_{uuid.uuid4().hex[:12]}",
            "favor_id": review_data.favor_id,
            "favor_title": favor_doc["title"],
            "giver_id": current_user.user_id,
            "giver_name": current_user.name,
            "receiver_id": reviewed_id,
            "receiver_name": reviewed_user["name"] if reviewed_user else "Utente",
            "message": review_data.public_thanks,
            "created_at": datetime.now(timezone.utc)
        }
        await db.thanks.insert_one(thanks_doc)
    
    # Update user's average ratings
    reviews_cursor = db.reviews.find({"reviewed_id": reviewed_id}, {"_id": 0})
    reviews = await reviews_cursor.to_list(1000)
    if reviews:
        avg_rating = sum(r["rating"] for r in reviews) / len(reviews)
        avg_kindness = sum(r.get("kindness_rating", 5) for r in reviews) / len(reviews)
        avg_impact = sum(r.get("impact_rating", 5) for r in reviews) / len(reviews)
        perfect_count = sum(1 for r in reviews if r["rating"] == 5 and r.get("kindness_rating", 5) == 5 and r.get("impact_rating", 5) == 5)
        
        await db.users.update_one(
            {"user_id": reviewed_id},
            {"$set": {
                "average_rating": round(avg_rating, 1),
                "average_kindness": round(avg_kindness, 1),
                "average_impact": round(avg_impact, 1),
                "perfect_reviews_count": perfect_count
            }}
        )
    
    await check_and_award_badges(reviewed_id)
    await update_community_score(reviewed_id)
    
    # ========================
    # NOTIFICATION: Review received
    # ========================
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": reviewed_id,
        "type": "review_received",
        "title": "Nuova Recensione! ⭐",
        "message": f"{current_user.name} ti ha lasciato una recensione per \"{favor_doc['title']}\"",
        "related_id": review_data.favor_id,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Push notification for review
    await send_push_notification(
        reviewed_id,
        "Nuova Recensione!",
        f"{current_user.name} ti ha lasciato una recensione per \"{favor_doc['title']}\"",
        {"favor_id": review_data.favor_id, "type": "review_received"}
    )
    
    # Check if both parties have reviewed - notify cycle complete
    all_reviews = await db.reviews.find({"favor_id": review_data.favor_id}).to_list(10)
    if len(all_reviews) >= 2:
        # Both reviews are in - notify both users that the cycle is complete
        for user_id in [favor_doc["creator_id"], favor_doc["accepted_by"]]:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "type": "favor_cycle_complete",
                "title": "Ciclo Completato! 🎉",
                "message": f"Entrambe le recensioni per \"{favor_doc['title']}\" sono state inviate. Grazie per aver partecipato!",
                "related_id": review_data.favor_id,
                "read": False,
                "created_at": datetime.now(timezone.utc)
            })
    
    return Review(**review_doc)

@api_router.get("/thanks", response_model=List[ThanksEntry])
async def get_thanks_board(limit: int = 20):
    """Get Bacheca dei Grazie (public thanks board)"""
    thanks_cursor = db.thanks.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    thanks = await thanks_cursor.to_list(limit)
    return [ThanksEntry(**t) for t in thanks]

@api_router.get("/reviews/user/{user_id}", response_model=List[Review])
async def get_user_reviews(user_id: str):
    reviews_cursor = db.reviews.find({"reviewed_id": user_id}, {"_id": 0}).sort("created_at", -1)
    reviews = await reviews_cursor.to_list(100)
    return [Review(**review) for review in reviews]

@api_router.get("/reviews/favor/{favor_id}", response_model=List[Review])
async def get_favor_reviews(favor_id: str):
    reviews_cursor = db.reviews.find({"favor_id": favor_id}, {"_id": 0})
    reviews = await reviews_cursor.to_list(10)
    return [Review(**review) for review in reviews]

# ========================
# CHAT MESSAGES
# ========================

@api_router.get("/messages/{favor_id}", response_model=List[Message])
async def get_messages(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get all messages for a favor - only participants can see"""
    # Check if user is participant
    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    is_participant = (
        favor["creator_id"] == current_user.user_id or 
        favor.get("accepted_by") == current_user.user_id
    )
    if not is_participant:
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    
    messages_cursor = db.messages.find({"favor_id": favor_id}, {"_id": 0}).sort("created_at", 1)
    messages = await messages_cursor.to_list(500)
    return [Message(**m) for m in messages]

@api_router.post("/messages")
async def send_message(msg: MessageCreate, current_user: User = Depends(get_current_user)):
    """Send a message in favor chat - with content filters and moderation"""
    # Check if favor exists and user is participant
    favor = await db.favors.find_one({"favor_id": msg.favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    is_participant = (
        favor["creator_id"] == current_user.user_id or 
        favor.get("accepted_by") == current_user.user_id
    )
    if not is_participant:
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    
    # ========================
    # CHECK READ-ONLY STATUS
    # ========================
    # Chat becomes read-only 24h after completion or cancellation
    if favor["status"] in ["completed", "cancelled"]:
        completed_at = favor.get("completed_at") or favor.get("created_at")
        if completed_at:
            time_since = datetime.now(timezone.utc) - completed_at.replace(tzinfo=timezone.utc)
            if time_since.total_seconds() > 24 * 3600:  # 24 hours
                raise HTTPException(
                    status_code=403, 
                    detail="Chat in sola lettura - il favore è stato completato/annullato da più di 24 ore"
                )
    
    # Check if favor is in a state that allows messaging
    if favor["status"] not in ["accepted", "active", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Non puoi inviare messaggi per questo favore")
    
    # ========================
    # SHADOW BAN CHECK
    # ========================
    user_reports = await db.reports.count_documents({
        "reported_user_id": current_user.user_id,
        "status": "confirmed"
    })
    if user_reports >= 3:
        raise HTTPException(
            status_code=403,
            detail="La tua capacità di inviare messaggi è stata sospesa a causa di segnalazioni multiple"
        )
    
    content = msg.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Messaggio vuoto")
    
    # ========================
    # CONTENT FILTERS
    # ========================
    response_warnings = []
    
    # 1. Money filter
    if contains_money_reference(content):
        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        blocked_doc = {
            "message_id": message_id,
            "favor_id": msg.favor_id,
            "sender_id": current_user.user_id,
            "sender_name": current_user.name,
            "content": "[Messaggio bloccato - riferimento a transazioni in denaro]",
            "original_content": content,
            "is_system": False,
            "blocked": True,
            "block_reason": "money",
            "created_at": datetime.now(timezone.utc)
        }
        await db.messages.insert_one(blocked_doc)
        raise HTTPException(
            status_code=400, 
            detail="⚠️ Messaggio bloccato: non sono ammessi riferimenti a denaro reale. Usa solo i Granelli!"
        )
    
    # 2. Offensive language filter
    if contains_offensive_language(content):
        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        blocked_doc = {
            "message_id": message_id,
            "favor_id": msg.favor_id,
            "sender_id": current_user.user_id,
            "sender_name": current_user.name,
            "content": "[Messaggio bloccato - linguaggio inappropriato]",
            "original_content": content,
            "is_system": False,
            "blocked": True,
            "block_reason": "offensive",
            "created_at": datetime.now(timezone.utc)
        }
        await db.messages.insert_one(blocked_doc)
        raise HTTPException(
            status_code=400, 
            detail="⚠️ Messaggio bloccato: linguaggio inappropriato non ammesso"
        )
    
    # 3. Suspicious links filter
    if is_suspicious_link(content):
        raise HTTPException(
            status_code=400,
            detail="⚠️ Link esterni non ammessi. Puoi condividere solo link di mappe (Google Maps, OpenStreetMap)"
        )
    
    # 4. Personal data warning (not blocked, just flagged)
    personal_data_check = contains_personal_data(content)
    if personal_data_check['has_personal_data']:
        response_warnings.append({
            "type": "personal_data",
            "message": "Stai condividendo dati personali. Assicurati di fidarti del tuo vicino prima di procedere.",
            "data_types": personal_data_check['types']
        })
    
    # Save valid message
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    message_doc = {
        "message_id": message_id,
        "favor_id": msg.favor_id,
        "sender_id": current_user.user_id,
        "sender_name": current_user.name,
        "content": content,
        "message_type": msg.message_type or "text",  # text, meeting_point, image
        "is_system": False,
        "blocked": False,
        "has_personal_data": personal_data_check['has_personal_data'],
        "created_at": datetime.now(timezone.utc)
    }
    
    # Add meeting point data if provided
    if msg.meeting_point:
        message_doc["meeting_point"] = msg.meeting_point.dict()
    
    await db.messages.insert_one(message_doc)
    
    # Update last activity for debt system
    await update_last_activity(current_user.user_id)
    
    # ========================
    # NOTIFICATION FOR NEW MESSAGE
    # ========================
    # Determine recipient (the other participant)
    recipient_id = favor["accepted_by"] if current_user.user_id == favor["creator_id"] else favor["creator_id"]
    
    # Create notification for the recipient
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": recipient_id,
        "type": "new_message",
        "title": "Nuovo messaggio 💬",
        "message": f"{current_user.name}: {content[:50]}{'...' if len(content) > 50 else ''}",
        "related_id": msg.favor_id,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Push notification for new message
    await send_push_notification(
        recipient_id,
        f"Messaggio da {current_user.name}",
        content[:80] + ('...' if len(content) > 80 else ''),
        {"favor_id": msg.favor_id, "type": "new_message"}
    )
    
    # Prepare response (remove _id added by MongoDB)
    response_dict = {k: v for k, v in message_doc.items() if k != '_id'}
    response_dict["created_at"] = response_dict["created_at"].isoformat()
    
    # Add warnings to response if any
    if response_warnings:
        response_dict["warnings"] = response_warnings
    
    return response_dict

# ========================
# REVIEWER/DEBUG MODE (Store Approval)
# ========================

@api_router.post("/debug/mock-qr-scan")
async def mock_qr_scan(favor_id: str, current_user: User = Depends(get_current_user)):
    """Mock QR scan for reviewer accounts - simulates completing a favor without actual QR"""
    
    # Only allow for reviewer account
    if current_user.email != REVIEWER_EMAIL or not REVIEWER_MODE_ENABLED:
        raise HTTPException(status_code=403, detail="Funzione disponibile solo per account di test")
    
    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    if favor["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accettato'")
    
    # Check if user is participant
    is_creator = favor["creator_id"] == current_user.user_id
    is_acceptor = favor.get("accepted_by") == current_user.user_id
    
    if not is_creator and not is_acceptor:
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    
    # Simulate QR completion through the same atomic, balance-checked settlement
    parsed = Favor(**favor)
    await settle_favor(parsed, {"completion_method": "mock_qr_debug"})
    granelli_cost = parsed.granelli_cost

    return {
        "message": "DEBUG: Favore completato tramite mock QR scan",
        "favor_id": favor_id,
        "granelli_transferred": granelli_cost,
        "debug_mode": True
    }

@api_router.get("/debug/is-reviewer")
async def check_reviewer_status(current_user: User = Depends(get_current_user)):
    """Check if current user is a reviewer account"""
    is_reviewer = current_user.email == REVIEWER_EMAIL
    return {
        "is_reviewer": is_reviewer,
        "debug_features_enabled": is_reviewer and REVIEWER_MODE_ENABLED,
        "features": ["mock_qr_scan", "mock_gps"] if is_reviewer else []
    }

@api_router.post("/chat/report")
async def report_user_in_chat(report: ReportCreate, current_user: User = Depends(get_current_user)):
    """Report a user for inappropriate behavior in chat"""
    # Verify favor exists and reporter is participant
    favor = await db.favors.find_one({"favor_id": report.favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    is_participant = (
        favor["creator_id"] == current_user.user_id or 
        favor.get("accepted_by") == current_user.user_id
    )
    if not is_participant:
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    
    # Cannot report yourself
    if report.reported_user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi segnalare te stesso")
    
    # Check if already reported this user for this favor
    existing = await db.reports.find_one({
        "favor_id": report.favor_id,
        "reporter_id": current_user.user_id,
        "reported_user_id": report.reported_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hai già segnalato questo utente per questo favore")
    
    report_id = f"report_{uuid.uuid4().hex[:12]}"
    report_doc = {
        "report_id": report_id,
        "favor_id": report.favor_id,
        "reporter_id": current_user.user_id,
        "reported_user_id": report.reported_user_id,
        "reason": report.reason,
        "description": report.description,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.reports.insert_one(report_doc)
    
    # Check for shadow ban threshold
    total_reports = await db.reports.count_documents({
        "reported_user_id": report.reported_user_id
    })
    
    # Auto-confirm if user has 5+ reports (shadow ban threshold)
    if total_reports >= 5:
        await db.reports.update_many(
            {"reported_user_id": report.reported_user_id, "status": "pending"},
            {"$set": {"status": "confirmed"}}
        )
    
    return {
        "message": "Segnalazione inviata. Grazie per aiutarci a mantenere la community sicura.",
        "report_id": report_id
    }

@api_router.get("/chat/status/{favor_id}")
async def get_chat_status(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get chat status (active, read-only, etc.)"""
    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    is_participant = (
        favor["creator_id"] == current_user.user_id or 
        favor.get("accepted_by") == current_user.user_id
    )
    if not is_participant:
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    
    status = "active"
    read_only = False
    read_only_reason = None
    
    if favor["status"] in ["completed", "cancelled"]:
        completed_at = favor.get("completed_at") or favor.get("created_at")
        if completed_at:
            time_since = datetime.now(timezone.utc) - completed_at.replace(tzinfo=timezone.utc)
            if time_since.total_seconds() > 24 * 3600:
                status = "read_only"
                read_only = True
                read_only_reason = "Il favore è stato completato/annullato da più di 24 ore"
    
    return {
        "status": status,
        "read_only": read_only,
        "read_only_reason": read_only_reason,
        "favor_status": favor["status"],
        "favor_title": favor["title"],
        "granelli_cost": favor.get("granelli_cost", 1)
    }

@api_router.get("/messages/{favor_id}/unread")
async def get_unread_count(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get unread message count for a favor"""
    # Simple implementation - count messages not from current user
    count = await db.messages.count_documents({
        "favor_id": favor_id,
        "sender_id": {"$ne": current_user.user_id},
        "blocked": False
    })
    return {"unread": count}
