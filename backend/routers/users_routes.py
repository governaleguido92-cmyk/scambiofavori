"""HTTP routes: users."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403
from storage import delete_profile_picture, save_profile_picture

api_router = APIRouter(prefix="/api")

@api_router.post("/report")
async def report_content(report: GeneralReportCreate, current_user: User = Depends(get_current_user)):
    """Universal report endpoint for favors and user profiles"""
    
    # Validate report type
    if report.report_type not in ["favor", "user"]:
        raise HTTPException(status_code=400, detail="Tipo segnalazione non valido")
    
    # Cannot report yourself
    if report.report_type == "user" and report.target_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi segnalare te stesso")
    
    # Validate target exists
    if report.report_type == "favor":
        target = await db.favors.find_one({"favor_id": report.target_id})
        if not target:
            raise HTTPException(status_code=404, detail="Favore non trovato")
        # Cannot report your own favor
        if target["creator_id"] == current_user.user_id:
            raise HTTPException(status_code=400, detail="Non puoi segnalare il tuo favore")
    else:
        target = await db.users.find_one({"user_id": report.target_id})
        if not target:
            raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Check for duplicate report
    existing = await db.general_reports.find_one({
        "reporter_id": current_user.user_id,
        "report_type": report.report_type,
        "target_id": report.target_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hai già segnalato questo contenuto")
    
    report_id = f"greport_{uuid.uuid4().hex[:12]}"
    report_doc = {
        "report_id": report_id,
        "reporter_id": current_user.user_id,
        "report_type": report.report_type,
        "target_id": report.target_id,
        "reason": report.reason,
        "description": report.description,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.general_reports.insert_one(report_doc)
    
    # Check for auto-moderation threshold (5+ reports)
    total_reports = await db.general_reports.count_documents({
        "target_id": report.target_id,
        "report_type": report.report_type
    })
    
    if total_reports >= 5:
        if report.report_type == "favor":
            # Hide the favor
            await db.favors.update_one(
                {"favor_id": report.target_id},
                {"$set": {"status": "hidden_reported", "hidden_at": datetime.now(timezone.utc)}}
            )
        elif report.report_type == "user":
            # Shadow ban the user
            await db.users.update_one(
                {"user_id": report.target_id},
                {"$set": {"banned_from_chat": True, "shadow_banned": True}}
            )
    
    return {
        "message": "Segnalazione inviata. Grazie per aiutarci a mantenere la community sicura.",
        "report_id": report_id
    }

@api_router.post("/users/block")
async def block_user(block_req: BlockUserRequest, current_user: User = Depends(get_current_user)):
    """Block a user bidirectionally - both users won't see each other"""
    
    if block_req.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi bloccare te stesso")
    
    # Check target user exists
    target_user = await db.users.find_one({"user_id": block_req.user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Check if already blocked
    existing = await db.blocked_users.find_one({
        "$or": [
            {"blocker_id": current_user.user_id, "blocked_id": block_req.user_id},
            {"blocker_id": block_req.user_id, "blocked_id": current_user.user_id}
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Utente già bloccato")
    
    block_id = f"block_{uuid.uuid4().hex[:12]}"
    block_doc = {
        "block_id": block_id,
        "blocker_id": current_user.user_id,
        "blocked_id": block_req.user_id,
        "reason": block_req.reason,
        "created_at": datetime.now(timezone.utc)
    }
    await db.blocked_users.insert_one(block_doc)
    
    return {"message": "Utente bloccato. Non vedrai più questo utente e lui non vedrà te."}

@api_router.delete("/users/block/{user_id}")
async def unblock_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Unblock a user"""
    
    result = await db.blocked_users.delete_one({
        "$or": [
            {"blocker_id": current_user.user_id, "blocked_id": user_id},
            {"blocker_id": user_id, "blocked_id": current_user.user_id}
        ]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blocco non trovato")
    
    return {"message": "Utente sbloccato"}

@api_router.get("/users/blocked")
async def get_blocked_users(current_user: User = Depends(get_current_user)):
    """Get list of blocked users"""
    
    blocks = await db.blocked_users.find({
        "$or": [
            {"blocker_id": current_user.user_id},
            {"blocked_id": current_user.user_id}
        ]
    }, {"_id": 0}).to_list(100)
    
    blocked_ids = set()
    for block in blocks:
        if block["blocker_id"] == current_user.user_id:
            blocked_ids.add(block["blocked_id"])
        else:
            blocked_ids.add(block["blocker_id"])
    
    # Get user info for blocked users
    blocked_users = []
    for user_id in blocked_ids:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if user:
            blocked_users.append({
                "user_id": user["user_id"],
                "name": user["name"],
                "title": user.get("title", "Nuovo Vicino")
            })
    
    return {"blocked_users": blocked_users}

@api_router.get("/users/{user_id}/public")
async def get_user_public_profile(user_id: str):
    """Get public profile of any user - visible to all"""
    
    user_doc = await db.users.find_one(
        {"user_id": user_id}, 
        {
            "_id": 0, 
            "password_hash": 0, 
            "email": 0,  # Privacy: no email
            "verification_code": 0,
            "verification_code_expires": 0,
            "approximate_latitude": 0,  # Privacy: no location
            "approximate_longitude": 0
        }
    )
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get user stats
    completed_given = await db.favors.count_documents({
        "accepted_by": user_id,
        "status": "completed"
    })
    completed_received = await db.favors.count_documents({
        "creator_id": user_id,
        "type": "request",
        "status": "completed"
    })
    
    # Get reviews received by this user
    reviews_count = await db.reviews.count_documents({"reviewed_id": user_id})
    
    return {
        "user_id": user_doc["user_id"],
        "name": user_doc.get("name", "Utente"),
        "picture": user_doc.get("picture"),
        "title": user_doc.get("title", "Nuovo Vicino"),
        "badges": user_doc.get("badges", []),
        "skills": user_doc.get("skills", []),
        "average_rating": user_doc.get("average_rating", 0),
        "average_kindness": user_doc.get("average_kindness", 0),
        "average_impact": user_doc.get("average_impact", 0),
        "total_favors_given": completed_given,
        "total_favors_received": completed_received,
        "reviews_count": reviews_count,
        "created_at": user_doc.get("created_at"),
        "is_supporter": user_doc.get("is_supporter", False)
    }

@api_router.get("/users/{user_id}/is-blocked")
async def check_if_blocked(user_id: str, current_user: User = Depends(get_current_user)):
    """Check if a user is blocked"""
    
    block = await db.blocked_users.find_one({
        "$or": [
            {"blocker_id": current_user.user_id, "blocked_id": user_id},
            {"blocker_id": user_id, "blocked_id": current_user.user_id}
        ]
    })
    
    return {"is_blocked": block is not None}

# ========================
# PROFILE COMPLETION TRACKING
# ========================

@api_router.get("/users/me/profile-completion")
async def get_profile_completion(current_user: User = Depends(get_current_user)):
    """Get profile completion percentage and missing items - 4 steps, 25% each"""
    
    completion_items = []
    total_items = 4
    completed_items = 0
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    
    # 1. Nome profilo (25%)
    has_name = bool(user_doc.get("name") and len(user_doc.get("name", "")) > 1)
    completion_items.append({
        "id": "name",
        "label": "Nome profilo",
        "completed": has_name,
        "points": 25
    })
    if has_name:
        completed_items += 1
    
    # 2. Foto profilo (25%)
    has_photo = bool(user_doc.get("avatar_url") or user_doc.get("picture"))
    completion_items.append({
        "id": "photo",
        "label": "Foto profilo",
        "completed": has_photo,
        "points": 25
    })
    if has_photo:
        completed_items += 1
    
    # 3. Competenze - almeno 3 (25%)
    db_skills = user_doc.get("skills", [])
    has_skills = bool(db_skills and len(db_skills) >= 3)
    completion_items.append({
        "id": "skills",
        "label": "Competenze (min. 3)",
        "completed": has_skills,
        "points": 25
    })
    if has_skills:
        completed_items += 1
    
    # 4. Primo favore completato (25%)
    completed_favors = await db.favors.count_documents({
        "$or": [
            {"creator_id": current_user.user_id, "status": "completed"},
            {"accepted_by": current_user.user_id, "status": "completed"}
        ]
    })
    has_completed_favor = completed_favors > 0
    completion_items.append({
        "id": "first_favor",
        "label": "Primo favore completato",
        "completed": has_completed_favor,
        "points": 25
    })
    if has_completed_favor:
        completed_items += 1
    
    percentage = int((completed_items / total_items) * 100)
    
    # Check if eligible for completion badge
    badge_earned = False
    if percentage == 100:
        # Award "Profilo Completo" badge if not already earned
        if "profilo_completo" not in (current_user.badges or []):
            await db.users.update_one(
                {"user_id": current_user.user_id},
                {"$addToSet": {"badges": "profilo_completo"}}
            )
            badge_earned = True
    
    return {
        "percentage": int(percentage),
        "items": completion_items,
        "completed_count": completed_items,
        "total_count": total_items,
        "badge_earned": badge_earned,
        "badge_name": "Profilo Completo" if badge_earned else None
    }

@api_router.post("/users/me/picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload profile picture"""
    
    content = await file.read()
    picture_url = await save_profile_picture(current_user.user_id, content, UPLOAD_DIR)
    
    # Update user in database
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"picture": picture_url, "avatar_url": picture_url}}
    )
    
    return {"picture": picture_url, "message": "Foto profilo aggiornata!"}

# ========================
# USER PROFILE ENDPOINTS
# ========================

@api_router.get("/users/{user_id}")
async def get_user_profile(user_id: str):
    """Get a user's public profile"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0, "exact_latitude": 0, "exact_longitude": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    user_doc["title"] = get_user_title(user_doc)
    if "credits" in user_doc:
        user_doc["granelli"] = user_doc.pop("credits")
    
    return User(**user_doc)

# ========================
# GDPR & LEGAL COMPLIANCE
# ========================

@api_router.post("/legal/accept")
async def accept_legal_terms(current_user: User = Depends(get_current_user)):
    """Accept Terms of Service and Privacy Policy"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {
            "$set": {
                "legal_accepted": True,
                "legal_accepted_at": datetime.now(timezone.utc)
            }
        }
    )
    return {"message": "Termini e condizioni accettati", "legal_accepted": True}

@api_router.get("/legal/status")
async def get_legal_status(current_user: User = Depends(get_current_user)):
    """Check if user has accepted legal terms"""
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "legal_accepted": 1, "legal_accepted_at": 1}
    )
    return {
        "legal_accepted": user_doc.get("legal_accepted", False) if user_doc else False,
        "legal_accepted_at": user_doc.get("legal_accepted_at") if user_doc else None
    }

@api_router.delete("/account")
async def delete_account(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_user)
):
    """
    GDPR Diritto all'Oblio - Cancellazione definitiva account
    Elimina tutti i dati sensibili dell'utente
    """
    # Verifica email per conferma
    if request.confirm_email.lower() != current_user.email.lower():
        raise HTTPException(status_code=400, detail="Email di conferma non corrisponde")
    
    user_id = current_user.user_id
    
    # 1. Elimina tutti i messaggi dell'utente
    await db.messages.delete_many({"sender_id": user_id})
    
    # 2. Elimina notifiche
    await db.notifications.delete_many({"user_id": user_id})
    
    # 3. Anonimizza i favori creati (mantieni per storico ma rimuovi dati personali)
    await db.favors.update_many(
        {"creator_id": user_id},
        {
            "$set": {
                "creator_name": "[Utente Eliminato]",
                "creator_id": "deleted_user",
                "exact_latitude": None,
                "exact_longitude": None,
                "address": None
            }
        }
    )
    
    # 4. Anonimizza favori accettati
    await db.favors.update_many(
        {"accepted_by": user_id},
        {
            "$set": {
                "accepted_by_name": "[Utente Eliminato]",
                "accepted_by": "deleted_user"
            }
        }
    )
    
    # 5. Anonimizza recensioni
    await db.reviews.update_many(
        {"reviewer_id": user_id},
        {"$set": {"reviewer_name": "[Utente Eliminato]", "reviewer_id": "deleted_user"}}
    )
    
    # 6. Rimuovi la foto profilo dallo storage (solo il file dell'utente)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "picture": 1, "avatar_url": 1})
    for picture_url in {(user_doc or {}).get("picture"), (user_doc or {}).get("avatar_url")}:
        await delete_profile_picture(user_id, picture_url, UPLOAD_DIR)

    # 7. Elimina definitivamente l'account utente
    await db.users.delete_one({"user_id": user_id})
    
    return {
        "message": "Account eliminato con successo",
        "details": "Tutti i tuoi dati personali sono stati cancellati in conformità al GDPR"
    }

@api_router.put("/user/name")
async def update_user_name(name_data: NameUpdate, current_user: User = Depends(get_current_user)):
    """Update user's display name"""
    name = name_data.name.strip()
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Il nome deve avere almeno 2 caratteri")
    if len(name) > 50:
        raise HTTPException(status_code=400, detail="Il nome non può superare i 50 caratteri")

    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"name": name}}
    )
    return {"message": "Nome aggiornato", "name": name}

@api_router.put("/user/skills")
async def update_user_skills(skills_data: SkillsUpdate, current_user: User = Depends(get_current_user)):
    """Update user's skills/competencies"""
    # Validate skills against available categories
    valid_categories = [c["name"] for c in FAVOR_CATEGORIES]
    valid_skills = [s for s in skills_data.skills if s in valid_categories]
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"skills": valid_skills}}
    )
    
    return {"message": "Competenze aggiornate", "skills": valid_skills}

@api_router.get("/user/skills")
async def get_user_skills(current_user: User = Depends(get_current_user)):
    """Get user's skills"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "skills": 1})
    return {"skills": user_doc.get("skills", []) if user_doc else []}
