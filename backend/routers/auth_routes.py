"""HTTP routes: auth."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403

api_router = APIRouter(prefix="/api")

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/register")
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate):
    """Register a new user with email verification via Resend"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    if len(user_data.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve essere di almeno {MIN_PASSWORD_LENGTH} caratteri")
    hashed_password = hash_password(user_data.password)
    referral_code = generate_referral_code()
    
    referred_by = None
    if user_data.referral_code:
        referrer = await db.users.find_one({"referral_code": user_data.referral_code})
        if referrer:
            referred_by = referrer["user_id"]
    
    # Generate 6-digit verification code
    verification_code = generate_numeric_code()
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "picture": None,
        "password_hash": hashed_password,
        "granelli": WELCOME_GRANELLI,
        "total_favors_given": 0,
        "total_favors_received": 0,
        "micro_favors_completed": 0,
        "emergencies_helped": 0,
        "total_hours_helped": 0.0,
        "total_donations": 0,
        "average_rating": 0.0,
        "average_kindness": 0.0,
        "average_impact": 0.0,
        "perfect_reviews_count": 0,
        "referral_code": referral_code,
        "referred_by": referred_by,
        "successful_referrals": 0,
        "badges": [],
        "title": "Nuovo Vicino",
        "is_vulnerable": False,
        "identity_verified": False,
        "email_verified": False,
        "verification_code": verification_code,
        "verification_code_expires": datetime.now(timezone.utc) + timedelta(hours=1),
        "community_score": 0,
        "social_impact_score": 0,
        "can_access_solidarity_fund": False,
        "reliability_score": 5.0,
        "debt_start_date": None,
        "last_activity_date": datetime.now(timezone.utc),
        "in_debt_recovery": False,
        "approximate_latitude": None,
        "approximate_longitude": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    # Send verification email
    email_sent = await send_verification_email(user_data.email, verification_code, user_data.name)
    
    if not email_sent:
        logger.info(f"[VERIFICATION] Code for {user_data.email}: {verification_code} (email not sent - Resend test mode)")
    
    return {
        "requiresVerification": True,
        "userId": user_id,
        "message": "Codice di verifica inviato alla tua email" if email_sent else "Registrazione completata. Verifica la tua email.",
    }

@api_router.post("/auth/verify-email", response_model=AuthResponse)
@limiter.limit("10/minute")
async def verify_email(request: Request, data: EmailVerifyRequest):
    """Verify email with code"""
    user_doc = await db.users.find_one({"user_id": data.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if user_doc.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email già verificata")
    
    stored_code = user_doc.get("verification_code")
    expires = user_doc.get("verification_code_expires")

    await check_one_time_code(user_doc, stored_code, data.code, "verification_attempts",
                              ["verification_code", "verification_code_expires"])
    
    # Check expiration - handle both timezone-aware and naive datetimes
    if expires:
        now = datetime.now(timezone.utc)
        # Make expires timezone-aware if it's naive
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            raise HTTPException(status_code=400, detail="Codice scaduto. Richiedi un nuovo codice.")
    
    # Mark email as verified
    await db.users.update_one(
        {"user_id": data.user_id},
        {
            "$set": {"email_verified": True},
            "$unset": {"verification_code": "", "verification_code_expires": ""}
        }
    )
    
    token = create_jwt_token(data.user_id)
    user_doc.pop("password_hash", None)
    user_doc.pop("verification_code", None)
    user_doc.pop("verification_code_expires", None)
    user_doc["email_verified"] = True
    
    return AuthResponse(user=User(**user_doc), token=token)

@api_router.post("/auth/resend-code")
@limiter.limit("3/minute")
async def resend_verification_code(request: Request, data: ResendCodeRequest):
    """Resend verification code via Resend email"""
    user_doc = await db.users.find_one({"user_id": data.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if user_doc.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email già verificata")
    
    # Generate new code
    new_code = generate_numeric_code()
    
    await db.users.update_one(
        {"user_id": data.user_id},
        {
            "$set": {
                "verification_code": new_code,
                "verification_attempts": 0,
                "verification_code_expires": datetime.now(timezone.utc) + timedelta(hours=1)
            }
        }
    )
    
    # Send email
    email_sent = await send_verification_email(user_doc['email'], new_code, user_doc['name'])
    
    return {"message": "Nuovo codice inviato" if email_sent else "Codice generato"}

@api_router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: ForgotPasswordRequest):
    """Send password reset code via email"""
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc:
        # Don't reveal if email exists
        return {"message": "Se l'email esiste, riceverai un codice di reset"}
    
    code = generate_numeric_code()

    await db.users.update_one(
        {"email": data.email},
        {"$set": {
            "reset_code": code,
            "reset_attempts": 0,
            "reset_code_expires": datetime.now(timezone.utc) + timedelta(hours=1)
        }}
    )
    
    # Send email
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background-color: #0F1A14; color: #FFFFFF; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D5A3D; margin: 0;">Scambio di Favori</h1>
            <p style="color: #B8D4C0; margin-top: 8px;">Reset Password</p>
        </div>
        <div style="background-color: #1A2E22; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #FFFFFF; margin: 0 0 8px 0;">Ciao <strong>{user_doc['name']}</strong>,</p>
            <p style="color: #B8D4C0; margin: 0 0 20px 0;">Hai richiesto il reset della password. Usa questo codice:</p>
            <div style="text-align: center; background-color: #0F1A14; padding: 16px; border-radius: 8px; border: 2px solid #E07B39;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #FFD700;">{code}</span>
            </div>
            <p style="color: #7A9F85; font-size: 12px; margin-top: 16px; text-align: center;">Il codice scade tra 1 ora</p>
        </div>
        <p style="color: #7A9F85; font-size: 12px; text-align: center;">Se non hai richiesto il reset, ignora questa email.</p>
    </div>
    """
    
    email_sent = False
    if RESEND_API_KEY:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [data.email],
                "subject": "Scambio di Favori - Reset Password",
                "html": html_content,
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
            logger.info(f"Password reset email sent to {data.email}")
        except Exception as e:
            logger.error(f"Failed to send reset email: {str(e)}")
    
    if not email_sent:
        logger.info(f"[RESET] Code for {data.email}: {code}")
    
    return {"message": "Se l'email esiste, riceverai un codice di reset"}

@api_router.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, data: ResetPasswordRequest):
    """Reset password with verification code"""
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc:
        raise HTTPException(status_code=400, detail="Codice non valido")
    
    stored_code = user_doc.get("reset_code")
    expires = user_doc.get("reset_code_expires")

    await check_one_time_code(user_doc, stored_code, data.code, "reset_attempts",
                              ["reset_code", "reset_code_expires"])
    
    if expires and isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Codice scaduto. Richiedi un nuovo codice")
    
    if len(data.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La password deve essere di almeno {MIN_PASSWORD_LENGTH} caratteri")
    
    hashed = hash_password(data.new_password)
    
    await db.users.update_one(
        {"email": data.email},
        {
            "$set": {"password_hash": hashed},
            "$unset": {"reset_code": "", "reset_code_expires": ""}
        }
    )
    
    logger.info(f"Password reset successful for {data.email}")
    return {"message": "Password aggiornata con successo"}

@api_router.post("/auth/recover-username")
@limiter.limit("3/minute")
async def recover_username(request: Request, data: RecoverUsernameRequest):
    """Send username reminder via email"""
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc:
        return {"message": "Se l'email esiste, riceverai il tuo nome utente"}
    
    code = generate_numeric_code()

    await db.users.update_one(
        {"email": data.email},
        {"$set": {
            "username_recovery_code": code,
            "username_recovery_attempts": 0,
            "username_recovery_expires": datetime.now(timezone.utc) + timedelta(hours=1)
        }}
    )
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background-color: #0F1A14; color: #FFFFFF; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D5A3D; margin: 0;">Scambio di Favori</h1>
            <p style="color: #B8D4C0; margin-top: 8px;">Recupero Nome Utente</p>
        </div>
        <div style="background-color: #1A2E22; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #B8D4C0; margin: 0 0 16px 0;">Per verificare la tua identità, inserisci questo codice nell'app:</p>
            <div style="text-align: center; background-color: #0F1A14; padding: 16px; border-radius: 8px; border: 2px solid #2D5A3D;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #FFD700;">{code}</span>
            </div>
            <p style="color: #7A9F85; font-size: 12px; margin-top: 16px; text-align: center;">Il codice scade tra 1 ora</p>
        </div>
    </div>
    """
    
    email_sent = False
    if RESEND_API_KEY:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [data.email],
                "subject": "Scambio di Favori - Recupero Nome Utente",
                "html": html_content,
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
            logger.info(f"Username recovery email sent to {data.email}")
        except Exception as e:
            logger.error(f"Failed to send username recovery email: {str(e)}")
    
    if not email_sent:
        logger.info(f"[USERNAME RECOVERY] Code for {data.email}: {code}, username: {user_doc['name']}")
    
    return {"message": "Se l'email esiste, riceverai un codice di verifica"}

@api_router.post("/auth/verify-username-recovery")
@limiter.limit("5/minute")
async def verify_username_recovery(request: Request, data: VerifyUsernameRecoveryRequest):
    """Verify code and return username"""
    user_doc = await db.users.find_one({"email": data.email})
    if not user_doc:
        raise HTTPException(status_code=400, detail="Codice non valido")
    
    stored_code = user_doc.get("username_recovery_code")
    expires = user_doc.get("username_recovery_expires")

    await check_one_time_code(user_doc, stored_code, data.code, "username_recovery_attempts",
                              ["username_recovery_code", "username_recovery_expires"])
    
    if expires and isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Codice scaduto. Richiedi un nuovo codice")
    
    # Clean up
    await db.users.update_one(
        {"email": data.email},
        {"$unset": {"username_recovery_code": "", "username_recovery_expires": ""}}
    )
    
    return {"username": user_doc["name"], "message": f"Il tuo nome utente è: {user_doc['name']}"}

@api_router.post("/auth/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin, response: Response):
    """Login with email/password"""
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Email o password non validi")
    
    if "password_hash" not in user_doc:
        raise HTTPException(status_code=401, detail="Usa il login con Google per questo account")
    
    if not verify_password(credentials.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o password non validi")
    
    token = create_jwt_token(user_doc["user_id"])
    user_doc.pop("password_hash", None)
    user_doc["title"] = get_user_title(user_doc)
    if "credits" in user_doc:
        user_doc["granelli"] = user_doc.pop("credits")
    
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return AuthResponse(user=User(**user_doc), token=token)

@api_router.post("/auth/session")
@limiter.limit("10/minute")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id from Google OAuth"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id richiesto")
    
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            OAUTH_SESSION_URL,
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Session ID non valido")
    
    auth_data = auth_response.json()
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user_doc:
        user_id = user_doc["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "identity_verified": True}}
        )
        user_doc["name"] = name
        user_doc["picture"] = picture
        user_doc["identity_verified"] = True
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        referral_code = generate_referral_code()
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "granelli": WELCOME_GRANELLI,
            "total_favors_given": 0,
            "total_favors_received": 0,
            "micro_favors_completed": 0,
            "emergencies_helped": 0,
            "total_hours_helped": 0.0,
            "total_donations": 0,
            "average_rating": 0.0,
            "average_kindness": 0.0,
            "average_impact": 0.0,
            "perfect_reviews_count": 0,
            "referral_code": referral_code,
            "referred_by": None,
            "successful_referrals": 0,
            "badges": [],
            "title": "Nuovo Vicino",
            "is_vulnerable": False,
            "identity_verified": True,
            "community_score": 0,
            "social_impact_score": 0,
            "can_access_solidarity_fund": False,
            "approximate_latitude": None,
            "approximate_longitude": None,
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(user_doc)
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user_doc.pop("password_hash", None)
    user_doc["title"] = get_user_title(user_doc)
    if "credits" in user_doc:
        user_doc["granelli"] = user_doc.pop("credits")
    
    return {"user": User(**user_doc), "token": session_token}

@api_router.post("/auth/apple")
@limiter.limit("10/minute")
async def apple_auth(request: Request, auth_data: AppleAuthRequest, response: Response):
    """Authenticate with Apple Sign In"""
    import core as _core

    try:
        # The identity token must be signed by Apple, issued for this app and not expired.
        signing_key = await asyncio.to_thread(_core.get_apple_signing_key, auth_data.identity_token)
        decoded = jwt.decode(
            auth_data.identity_token,
            signing_key,
            algorithms=["RS256"],
            audience=APPLE_AUDIENCES,
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )

        apple_user_id = decoded["sub"]  # Apple's unique user identifier
        # Only the email inside the signed token is trusted, never the one sent in the request body.
        email_is_verified = str(decoded.get("email_verified", "true")).lower() != "false"
        email = decoded.get("email") if email_is_verified else None

        if not email:
            raise HTTPException(status_code=400, detail="Email richiesta per la registrazione")
        
        # Check if user exists
        user_doc = await db.users.find_one({"$or": [{"email": email}, {"apple_user_id": apple_user_id}]}, {"_id": 0})
        
        if user_doc:
            user_id = user_doc["user_id"]
            # Update Apple user ID if not set
            if not user_doc.get("apple_user_id"):
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"apple_user_id": apple_user_id, "identity_verified": True}}
                )
            user_doc["identity_verified"] = True
        else:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            referral_code = generate_referral_code()
            name = auth_data.full_name or email.split("@")[0]
            
            user_doc = {
                "user_id": user_id,
                "email": email,
                "name": name,
                "apple_user_id": apple_user_id,
                "granelli": WELCOME_GRANELLI,
                "total_favors_given": 0,
                "total_favors_received": 0,
                "micro_favors_completed": 0,
                "emergencies_helped": 0,
                "total_hours_helped": 0.0,
                "total_donations": 0,
                "average_rating": 0.0,
                "average_kindness": 0.0,
                "average_impact": 0.0,
                "perfect_reviews_count": 0,
                "referral_code": referral_code,
                "badges": [],
                "title": "Nuovo Vicino",
                "is_vulnerable": False,
                "identity_verified": True,
                "community_score": 0,
                "social_impact_score": 0,
                "can_access_solidarity_fund": False,
                "is_supporter": False,
                "skills": [],
                "notifications_enabled": True,
                "legal_accepted": False,
                "reliability_score": 5.0,
                "created_at": datetime.now(timezone.utc),
            }
            await db.users.insert_one({**user_doc})
        
        # Generate JWT token
        token_payload = {
            "user_id": user_id,
            "email": email,
            "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
        }
        token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        user_doc.pop("password_hash", None)
        user_doc["title"] = get_user_title(user_doc)
        
        return {"user": User(**user_doc), "token": token}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Apple auth error: {str(e)}")
        raise HTTPException(status_code=401, detail="Autenticazione Apple fallita")

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@api_router.post("/auth/logout")
async def logout(response: Response, request: Request):
    """Logout current user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logout effettuato"}
