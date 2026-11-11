"""HTTP routes: favors."""
from fastapi import APIRouter, Query
from core import *  # noqa: F401,F403
import trust
import places

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
    content_to_check = f"{favor_data.title} {favor_data.description} {favor_data.address or ''}"
    moderation_result = moderate_content(content_to_check)
    if not moderation_result["allowed"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Contenuto non consentito: {moderation_result['reason']}. Modifica il testo e riprova."
        )
    
    # I favori si fanno di persona: serve il luogo e non sono ammessi favori a distanza
    if favor_data.latitude is None or favor_data.longitude is None:
        raise HTTPException(status_code=400, detail="Indica dove si svolge il favore: i favori si fanno di persona.")
    if contains_remote_favor(content_to_check):
        raise HTTPException(status_code=400, detail=REMOTE_FAVOR_MESSAGE)

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
        committed = await trust.committed_granelli(current_user.user_id)
        if current_user.granelli - committed < granelli_cost:
            raise HTTPException(status_code=400, detail=trust.not_enough_granelli_message(CURRENCY_NAME, current_user.granelli, committed, granelli_cost))
    
    await trust.ensure_not_on_hold(current_user.user_id)
    await trust.ensure_new_user_can_create(current_user.user_id, granelli_cost)

    # Update last activity
    await update_last_activity(current_user.user_id)
    
    favor_id = f"favor_{uuid.uuid4().hex[:12]}"
    qr_code = generate_qr_code()
    
    # Privacy: create approximate location
    approx_lat, approx_lon = None, None
    if favor_data.latitude and favor_data.longitude:
        approx_lat, approx_lon = approximate_location(favor_data.latitude, favor_data.longitude, seed=current_user.user_id)
    
    # Check if user is in debt (for priority highlighting)
    creator_in_debt = current_user.granelli < 0
    
    # Scadenza dell'annuncio: da 1 ora a 5 giorni (le app vecchie mandano i giorni)
    validity_hours = favor_validity_hours(favor_data.validity_hours, favor_data.validity_days)
    validity_days = validity_days_for_old_apps(validity_hours)
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(hours=validity_hours)
    
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
        "validity_hours": validity_hours,
        "expires_at": expires_at,
        "status": "active",
        "accepted_by": None,
        "accepted_by_name": None,
        "approximate_latitude": approx_lat,
        "approximate_longitude": approx_lon,
        "exact_latitude": favor_data.latitude,
        "exact_longitude": favor_data.longitude,
        "address": favor_data.address,
        "creator_in_debt": creator_in_debt,  # For priority highlighting
        "qr_code": qr_code,
        "checkin_completed": False,
        "created_at": created_at,
        "completed_at": None
    }
    
    await db.favors.insert_one(favor_doc)

    # Prepara in sottofondo l'elenco dei luoghi della zona (per il punto d'incontro), usando solo la posizione
    # approssimata: così, quando serve in chat, è già pronto.
    if approx_lat is not None and approx_lon is not None:
        places.schedule_warm(approx_lat, approx_lon)
    
    # Invia notifiche agli utenti con competenze corrispondenti (solo per richieste)
    if favor_data.type == "request":
        await create_skill_match_notifications(favor_doc)
    
    # For public response, hide exact location
    favor_doc["exact_latitude"] = None
    favor_doc["exact_longitude"] = None
    
    return Favor(**favor_doc)

FAVOR_TITLE_MAX = 100
FAVOR_DESCRIPTION_MAX = 500
FAVOR_DURATION_MAX_HOURS = 999

@api_router.put("/favors/{favor_id}", response_model=Favor, response_model_exclude={"qr_code"})
async def update_favor(favor_id: str, update: FavorUpdate, current_user: User = Depends(get_current_user)):
    """Modifica un favore proprio che nessuno ha ancora accettato. Solo i campi inviati cambiano."""
    changes = update.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nessuna modifica indicata")

    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    if favor["creator_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Puoi modificare solo i tuoi favori")
    if favor["status"] != "active" or favor.get("accepted_by"):
        raise HTTPException(status_code=400, detail="Puoi modificare solo i favori che nessuno ha ancora accettato")

    values: dict = {}
    if "title" in changes:
        title = changes["title"].strip()
        if not title or len(title) > FAVOR_TITLE_MAX:
            raise HTTPException(status_code=400, detail=f"Il titolo deve avere da 1 a {FAVOR_TITLE_MAX} caratteri")
        values["title"] = title
    if "description" in changes:
        description = changes["description"].strip()
        if not description or len(description) > FAVOR_DESCRIPTION_MAX:
            raise HTTPException(status_code=400, detail=f"La descrizione deve avere da 1 a {FAVOR_DESCRIPTION_MAX} caratteri")
        values["description"] = description
    if "category" in changes:
        if changes["category"] not in [category["name"] for category in FAVOR_CATEGORIES]:
            raise HTTPException(status_code=400, detail="Categoria non valida")
        values["category"] = changes["category"]

    # Lo stesso filtro della pubblicazione: odio, minacce, contenuti sessuali, insulti
    moderation_result = moderate_content(" ".join(values.get(field, "") for field in ("title", "description")))
    if not moderation_result["allowed"]:
        raise HTTPException(
            status_code=400,
            detail=f"Contenuto non consentito: {moderation_result['reason']}. Modifica il testo e riprova.",
        )

    if contains_remote_favor(" ".join(values.get(field, "") for field in ("title", "description"))):
        raise HTTPException(status_code=400, detail=REMOTE_FAVOR_MESSAGE)

    if "duration_hours" in changes:
        duration = changes["duration_hours"]
        if duration <= 0 or duration > FAVOR_DURATION_MAX_HOURS:
            raise HTTPException(status_code=400, detail="La durata deve essere di almeno un'ora")
        granelli_cost = max(1, int(duration * GRANELLI_PER_HOUR))
        if favor["type"] == "request" and granelli_cost > current_user.granelli:
            raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti. Aiuta un vicino con «Dona un favore» per guadagnarne.")
        values["duration_hours"] = duration
        values["granelli_cost"] = granelli_cost
    if changes.get("validity_hours") is not None or changes.get("validity_days") is not None:
        validity_hours = favor_validity_hours(changes.get("validity_hours"), changes.get("validity_days"))
        values["validity_hours"] = validity_hours
        values["validity_days"] = validity_days_for_old_apps(validity_hours)
        values["expires_at"] = datetime.now(timezone.utc) + timedelta(hours=validity_hours)

    await db.favors.update_one({"favor_id": favor_id}, {"$set": values})
    favor.update(values)
    # Come alla pubblicazione, la posizione esatta non esce mai
    favor["exact_latitude"] = None
    favor["exact_longitude"] = None
    return Favor(**favor)

@api_router.get("/favors", response_model=List[Favor], response_model_exclude={"__all__": {"qr_code"}})
async def get_favors(
    type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "active",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: Optional[float] = None,
    current_user: User = Depends(get_current_user),
):
    """Get favors (richiede il login; usa la posizione approssimata per privacy)"""
    query = {"status": status}
    
    # Filtra annunci scaduti (solo per status active)
    if status == "active":
        now = datetime.now(timezone.utc)
        query["$or"] = [
            {"expires_at": {"$gt": now}},  # Non ancora scaduto
            {"expires_at": None},           # Vecchi annunci senza scadenza
            {"expires_at": {"$exists": False}}  # Compatibilità con dati esistenti
        ]
    
    else:
        # Favori già presi, conclusi o nascosti li vedono solo le persone coinvolte
        query["$or"] = [{"creator_id": current_user.user_id}, {"accepted_by": current_user.user_id}]

    if type:
        query["type"] = type
    if category:
        query["category"] = category

    # Chi ho bloccato (o chi ha bloccato me) non compare nell'elenco
    blocked_ids = await get_blocked_user_ids(current_user.user_id)
    if blocked_ids:
        query["creator_id"] = {"$nin": list(blocked_ids)}
    
    sort_order = [("created_at", -1)]
    
    favors_cursor = db.favors.find(query, {"_id": 0, "exact_latitude": 0, "exact_longitude": 0}).sort(sort_order).limit(100)
    favors = await favors_cursor.to_list(100)

    # Chi ha creato un favore lo vede esattamente dove si trova (la sfocatura serve solo agli altri)
    own_ids = [f["favor_id"] for f in favors if f.get("creator_id") == current_user.user_id]
    if own_ids:
        exact_positions = {
            doc["favor_id"]: doc
            async for doc in db.favors.find(
                {"favor_id": {"$in": own_ids}},
                {"_id": 0, "favor_id": 1, "exact_latitude": 1, "exact_longitude": 1},
            )
        }
        for favor in favors:
            exact = exact_positions.get(favor["favor_id"])
            if exact and exact.get("exact_latitude") is not None and exact.get("exact_longitude") is not None:
                favor["approximate_latitude"] = exact["exact_latitude"]
                favor["approximate_longitude"] = exact["exact_longitude"]
    
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
        # L'indirizzo scritto a mano lo vedono solo le persone coinvolte
        if current_user.user_id not in (favor.get("creator_id"), favor.get("accepted_by")):
            favor["address"] = None
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
        result.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return result

@api_router.get("/favors/emergencies", response_model=List[Favor])
async def get_emergencies(current_user: User = Depends(get_current_user)):
    """Le Urgenze non esistono più: le app vecchie chiedono ancora questo elenco e ricevono un elenco vuoto."""
    return []

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
async def get_favor(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific favor (richiede il login)"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")

    if favor_doc["creator_id"] in await get_blocked_user_ids(current_user.user_id):
        raise HTTPException(status_code=404, detail="Favore non trovato")

    # La posizione esatta la vedono solo chi ha creato il favore e chi lo ha accettato
    is_involved = favor_doc["creator_id"] == current_user.user_id or favor_doc.get("accepted_by") == current_user.user_id
    if not is_involved:
        if favor_doc.get("status") != "active":
            raise HTTPException(status_code=404, detail="Favore non trovato")
        favor_doc["exact_latitude"] = None
        favor_doc["exact_longitude"] = None
        favor_doc["address"] = None

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

    if favor.creator_id in await get_blocked_user_ids(current_user.user_id):
        raise HTTPException(status_code=403, detail="Non puoi accettare i favori di questo utente")

    await trust.ensure_payer_has_free_granelli(favor, current_user.user_id, CURRENCY_NAME)

    await trust.ensure_not_on_hold(current_user.user_id)
    await trust.ensure_new_user_can_accept(current_user.user_id)
    await trust.ensure_pair_not_overused(current_user.user_id, favor.creator_id)
    await ensure_daily_hours_for_accept(favor, current_user.user_id)

    # Atomic check-and-set: filter su status="active" previene double-accept concorrente
    updated = await db.favors.find_one_and_update(
        {"favor_id": data.favor_id, "status": "active"},
        {"$set": {
            "status": "accepted",
            "accepted_by": current_user.user_id,
            "accepted_by_name": current_user.name,
            "accepted_at": datetime.now(timezone.utc),
        }},
        return_document=True,
        projection={"_id": 0}
    )

    if not updated:
        raise HTTPException(status_code=400, detail="Il favore non è più disponibile")

    favor_doc = updated
    
    # Notifica nell'app: chi ha pubblicato il favore la trova in campanella anche senza push
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": favor.creator_id,
        "type": "favor_accepted",
        "title": "Favore accettato! 🤝",
        "message": f"{current_user.name} ha accettato \"{favor.title}\". Apri la chat per accordarvi.",
        "related_id": data.favor_id,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })

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
    if not MANUAL_COMPLETION_ENABLED:
        raise HTTPException(
            status_code=400,
            detail="Il favore si completa solo con il codice QR: chi lo riceve mostra il codice, chi lo esegue lo scansiona.",
        )
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accepted'")
    
    _, payer_id = favor_parties(favor)
    if payer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo chi riceve il servizio può confermare il completamento")
    
    # Il limite giornaliero delle ore si controlla quando si accetta il favore, non qui: chi ha fatto il lavoro viene sempre pagato
    
    # ========================
    # PROXIMITY CHECK (30 m + tolleranza del GPS) - Geofencing
    # ========================
    distance_m = None
    has_place = favor.exact_latitude is not None and favor.exact_longitude is not None
    if PROXIMITY_REQUIRED and has_place and (data.latitude is None or data.longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Per confermare serve la tua posizione: i favori si fanno di persona, devi essere sul posto.",
        )
    if data.latitude is not None and data.longitude is not None:
        # Senza posizione (permesso negato, versioni vecchie dell'app) la conferma passa come prima
        if favor.exact_latitude is not None and favor.exact_longitude is not None:
            distance_km = calculate_distance(
                data.latitude, data.longitude,
                favor.exact_latitude, favor.exact_longitude
            )
            distance_m = distance_km * 1000  # Convert km to meters
            tolerance = min(max(data.accuracy_meters or 0, 0), MAX_GPS_TOLERANCE_METERS)

            if distance_m > MAX_EXCHANGE_DISTANCE_METERS + tolerance:
                raise HTTPException(
                    status_code=400,
                    detail=f"Siete troppo lontani per confermare lo scambio ({int(distance_m)} m). Avvicinatevi entro {MAX_EXCHANGE_DISTANCE_METERS} m."
                )
    
    helper_id, _ = await settle_favor(favor)
    
    # ========================
    # SECURITY LOG: Record transaction for legal purposes
    # ========================
    await log_security_transaction(
        favor_id=favor.favor_id,
        creator_id=favor.creator_id,
        accepted_by=favor.accepted_by,
        duration_hours=favor.duration_hours,
        granelli_cost=favor.granelli_cost,
        latitude=None,  # la posizione non si conserva: resta solo la distanza
        longitude=None,
        qr_code=data.qr_code if hasattr(data, 'qr_code') else None,
        distance_m=distance_m,
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
        {"$set": {
            "status": "cancelled",
            "cancelled_by": current_user.user_id,
            "cancelled_at": datetime.now(timezone.utc),
            "cancelled_after_accept": favor_doc["status"] == "accepted",
        }}
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

    # Chi scansiona deve essere sul posto: il QR girato a distanza tra due account non basta più
    has_place = favor.exact_latitude is not None and favor.exact_longitude is not None
    if has_place:
        if data.latitude is None or data.longitude is None:
            if QR_LOCATION_REQUIRED:
                raise HTTPException(
                    status_code=400,
                    detail="Per completare serve la tua posizione: i favori si fanno di persona. Attiva la posizione e riprova.",
                )
        else:
            distance_m = calculate_distance(data.latitude, data.longitude, favor.exact_latitude, favor.exact_longitude) * 1000
            tolerance = min(max(data.accuracy_meters or 0, 0), MAX_GPS_TOLERANCE_METERS)
            if distance_m > MAX_EXCHANGE_DISTANCE_METERS + tolerance:
                raise HTTPException(
                    status_code=400,
                    detail=f"Siete troppo lontani per completare ({int(distance_m)} m). Avvicinatevi entro {MAX_EXCHANGE_DISTANCE_METERS} m.",
                )
    
    # Il limite giornaliero delle ore si controlla quando si accetta il favore, non qui: chi ha fatto il lavoro viene sempre pagato
    
    helper_id, receiver_id = await settle_favor(favor, {"checkin_completed": True})
    
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
        "message": f"Il favore \"{favor.title}\" è stato completato. Grazie per aver usato Scambio Favori!",
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
    
    # I testi pubblici (commento e Bacheca dei Grazie) passano dal filtro prima di essere salvati
    ensure_text_allowed(review_data.comment, review_data.public_thanks)

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
        # Il massimo dei voti conta una sola volta per persona: tre recensioni di fila dello stesso amico valgono una
        perfect_count = len({r.get("reviewer_id") for r in reviews
                             if r["rating"] == 5 and r.get("kindness_rating", 5) == 5 and r.get("impact_rating", 5) == 5})
        
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
    review_line = f"⭐ {current_user.name} ti ha lasciato una recensione"
    if not await merge_into_completion_notification(reviewed_id, review_line, favor_id=review_data.favor_id):
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
            cycle_line = "🎉 Entrambe le recensioni sono state inviate: grazie per aver partecipato!"
            if await merge_into_completion_notification(user_id, cycle_line, favor_id=review_data.favor_id):
                continue
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
async def get_thanks_board(limit: int = Query(20, ge=1, le=50), current_user: User = Depends(get_current_user)):
    """Bacheca dei Grazie (solo per chi ha fatto il login)"""
    thanks_cursor = db.thanks.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    thanks = await thanks_cursor.to_list(limit)
    return [ThanksEntry(**t) for t in thanks]

@api_router.get("/reviews/user/{user_id}", response_model=List[Review])
async def get_user_reviews(user_id: str, current_user: User = Depends(get_current_user)):
    # Commenti e tag privati: li legge solo la persona recensita. Gli altri vedono il profilo pubblico.
    if user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Non puoi vedere queste recensioni")
    reviews_cursor = db.reviews.find({"reviewed_id": user_id}, {"_id": 0}).sort("created_at", -1)
    reviews = await reviews_cursor.to_list(100)
    return [Review(**review) for review in reviews]

@api_router.get("/reviews/favor/{favor_id}", response_model=List[Review])
async def get_favor_reviews(favor_id: str, current_user: User = Depends(get_current_user)):
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0, "creator_id": 1, "accepted_by": 1})
    if not favor_doc or current_user.user_id not in (favor_doc.get("creator_id"), favor_doc.get("accepted_by")):
        raise HTTPException(status_code=404, detail="Favore non trovato")
    reviews_cursor = db.reviews.find({"favor_id": favor_id}, {"_id": 0})
    reviews = await reviews_cursor.to_list(10)
    return [Review(**review) for review in reviews]

# ========================
# CHAT MESSAGES
# ========================

CLOSED_CHAT_STATUSES = ("completed", "cancelled")
LAST_MESSAGE_PREVIEW_CHARS = 120
MAX_CONVERSATIONS = 200


def _as_utc(value: datetime) -> datetime:
    """Mongo restituisce a volte date senza fuso: le trattiamo come UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@api_router.get("/conversations")
async def get_conversations(current_user: User = Depends(get_current_user)):
    """Le conversazioni dell'utente, dalla più recente: una per favore con almeno un messaggio."""
    me = current_user.user_id
    blocked_ids = await get_blocked_user_ids(me)
    favors = await db.favors.find(
        {"$or": [{"creator_id": me}, {"accepted_by": me}]}, {"_id": 0}
    ).limit(MAX_CONVERSATIONS).to_list(MAX_CONVERSATIONS)

    reads = {
        doc["favor_id"]: _as_utc(doc["last_read_at"])
        async for doc in db.chat_reads.find({"user_id": me}, {"_id": 0})
    }

    conversations = []
    for favor in favors:
        is_creator = favor["creator_id"] == me
        other_id = favor.get("accepted_by") if is_creator else favor["creator_id"]
        if not other_id or other_id in blocked_ids:
            continue

        shown = {"favor_id": favor["favor_id"], "blocked": False, "is_system": False}
        last = await db.messages.find(shown, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
        if not last:
            continue

        last_read = reads.get(favor["favor_id"])
        incoming = {**shown, "sender_id": {"$ne": me}}
        if last_read:
            incoming["created_at"] = {"$gt": last_read}
        unread = await db.messages.count_documents(incoming)

        message = last[0]
        conversations.append({
            "favor_id": favor["favor_id"],
            "favor_title": favor["title"],
            "favor_status": favor["status"],
            "other_user_id": other_id,
            "other_user_name": (favor.get("accepted_by_name") if is_creator else favor.get("creator_name")) or "Vicino",
            "last_message": {
                "content": message["content"][:LAST_MESSAGE_PREVIEW_CHARS],
                "sender_id": message["sender_id"],
                "message_type": message.get("message_type", "text"),
                "created_at": _as_utc(message["created_at"]),
            },
            "unread": unread,
            "can_write": favor["status"] not in CLOSED_CHAT_STATUSES,
        })

    conversations.sort(key=lambda c: c["last_message"]["created_at"], reverse=True)
    return conversations


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

    # Aprire la chat segna come letti i messaggi ricevuti fino a ora
    await db.chat_reads.update_one(
        {"user_id": current_user.user_id, "favor_id": favor_id},
        {"$set": {"last_read_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
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

    other_id = favor.get("accepted_by") if favor["creator_id"] == current_user.user_id else favor["creator_id"]
    if other_id and other_id in await get_blocked_user_ids(current_user.user_id):
        raise HTTPException(status_code=403, detail="Non puoi scrivere a questo utente")
    
    # ========================
    # CHAT CHIUSA A FAVORE CONCLUSO
    # ========================
    # Dopo il completamento o l'annullamento non si può più scrivere; i messaggi restano leggibili.
    if favor["status"] in CLOSED_CHAT_STATUSES:
        raise HTTPException(
            status_code=403,
            detail="Il favore è concluso: non puoi più scrivere in questa chat"
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
    
    await trust.ensure_not_on_hold(current_user.user_id)

    content = msg.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Messaggio vuoto")

    # Anche il nome e l'indirizzo del punto d'incontro sono testo libero
    if msg.meeting_point:
        ensure_text_allowed(msg.meeting_point.name, msg.meeting_point.address)
    
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
    
    # 1b. Scam filter: codici, anticipi, ricariche, carte, IBAN
    if contains_scam_hint(content):
        await db.messages.insert_one({
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
            "favor_id": msg.favor_id,
            "sender_id": current_user.user_id,
            "sender_name": current_user.name,
            "content": "[Messaggio bloccato - possibile truffa]",
            "original_content": content,
            "is_system": False,
            "blocked": True,
            "block_reason": "scam",
            "created_at": datetime.now(timezone.utc)
        })
        raise HTTPException(
            status_code=400,
            detail="⚠️ Messaggio bloccato: possibile truffa. Non chiedere né mandare codici, password, anticipi o dati di carte. Un favore non richiede soldi."
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
    
    # 5. Contatto fuori dall'app: il messaggio passa, chi lo riceve vede un avviso accanto al testo
    is_off_app_contact = contains_off_app_contact(content)
    if is_off_app_contact:
        response_warnings.append({
            "type": "off_app_contact",
            "message": "Hai proposto di continuare fuori dall'app: per sicurezza di tutti è meglio restare in chat.",
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
        "off_app_contact": is_off_app_contact,
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
    
    # Create notification for the recipient: i messaggi non letti dello stesso favore si raggruppano in una sola voce
    preview = f"{content[:50]}{'...' if len(content) > 50 else ''}"
    now_utc = datetime.now(timezone.utc)
    grouped = await db.notifications.find_one_and_update(
        {"user_id": recipient_id, "type": "new_message", "related_id": msg.favor_id, "read": False},
        {"$inc": {"count": 1}, "$set": {"created_at": now_utc, "last_preview": preview, "last_sender": current_user.name}},
    )
    if grouped:
        total = grouped.get("count", 1) + 1
        await db.notifications.update_one(
            {"notification_id": grouped["notification_id"]},
            {"$set": {"message": f"{total} nuovi messaggi da {current_user.name}. Ultimo: {preview}"}},
        )
    else:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": recipient_id,
            "type": "new_message",
            "title": "Nuovo messaggio 💬",
            "message": f"{current_user.name}: {preview}",
            "related_id": msg.favor_id,
            "read": False,
            "count": 1,
            "created_at": now_utc,
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

    # Si può segnalare solo l'altra persona di questo favore, mai un utente qualsiasi
    counterpart = favor.get("accepted_by") if favor["creator_id"] == current_user.user_id else favor["creator_id"]
    if not counterpart or report.reported_user_id != counterpart:
        raise HTTPException(status_code=400, detail="Puoi segnalare solo l'altra persona di questo favore")

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
    reporter_ids = await db.reports.distinct("reporter_id", {
        "reported_user_id": report.reported_user_id,
        "status": {"$ne": "dismissed"},
    })
    total_reports = await trust.trusted_reporter_count(reporter_ids)
    
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
    
    if favor["status"] in CLOSED_CHAT_STATUSES:
        status = "read_only"
        read_only = True
        read_only_reason = "Il favore è concluso: non puoi più scrivere in questa chat"
    
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
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0, "creator_id": 1, "accepted_by": 1})
    if not favor_doc or current_user.user_id not in (favor_doc.get("creator_id"), favor_doc.get("accepted_by")):
        raise HTTPException(status_code=404, detail="Favore non trovato")
    count = await db.messages.count_documents({
        "favor_id": favor_id,
        "sender_id": {"$ne": current_user.user_id},
        "blocked": False
    })
    return {"unread": count}
