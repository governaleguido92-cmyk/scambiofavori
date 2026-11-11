"""HTTP routes: auth."""
from fastapi import APIRouter
import html

from core import *  # noqa: F401,F403
import age
import google_auth
import sms

api_router = APIRouter(prefix="/api")

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/register")
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate):
    """Register a new user with email verification via Resend"""
    ensure_text_allowed(user_data.name)
    birth_year = None
    if user_data.birth_date is not None:
        try:
            birth_year = age.check_adult(user_data.birth_date)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
    existing = await db.users.find_one(email_match(user_data.email))
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
        "birth_year": birth_year,  # della data di nascita si conserva solo l'anno
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
        logger.warning("Verification email not sent for a new registration")
    
    return {
        "requiresVerification": True,
        "userId": user_id,
        "message": "Codice di verifica inviato alla tua email" if email_sent else "Registrazione completata. Verifica la tua email.",
    }

class PhoneRequestBody(BaseModel):
    phone: str


class PhoneVerifyBody(BaseModel):
    code: str
    phone: Optional[str] = None


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _check_code_with_twilio(user_doc: dict, data: PhoneVerifyBody) -> None:
    """Controlla il codice con Twilio Verify, con tentativi limitati e solo per il numero richiesto."""
    user_id = user_doc["user_id"]
    attempts = user_doc.get("phone_attempts", 0)
    phone = sms.normalize_phone(data.phone)
    pending_hash = user_doc.get("phone_pending_hash")
    if attempts >= MAX_CODE_ATTEMPTS or not pending_hash:
        raise HTTPException(status_code=400, detail="Codice non valido. Richiedi un nuovo codice.")
    if not phone or hash_secret_value(phone) != pending_hash:
        raise HTTPException(status_code=400, detail="Numero non corrispondente. Richiedi un nuovo codice.")
    if not await sms.verify_check(phone, data.code.strip()):
        await db.users.update_one({"user_id": user_id}, {"$inc": {"phone_attempts": 1}})
        raise HTTPException(status_code=400, detail="Codice non valido")


@api_router.post("/auth/phone/request")
@limiter.limit("10/minute")
async def request_phone_code(request: Request, data: PhoneRequestBody, current_user: User = Depends(get_current_user)):
    """Invia un codice via SMS per verificare il telefono (richiesto prima del primo favore)."""
    if current_user.phone_verified:
        raise HTTPException(status_code=400, detail="Telefono già verificato")
    phone = sms.normalize_phone(data.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Numero di telefono non valido")
    phone_hash = hash_secret_value(phone)

    if await db.users.find_one({"phone_hash": phone_hash, "user_id": {"$ne": current_user.user_id}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Questo numero è già usato da un altro account")

    now = datetime.now(timezone.utc)
    recent = await db.phone_requests.find(
        {"user_id": current_user.user_id, "created_at": {"$gt": now - timedelta(hours=1)}}, {"_id": 0}
    ).to_list(100)
    if len(recent) >= PHONE_MAX_REQUESTS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Troppi codici richiesti. Riprova tra un'ora.")
    if recent and now - max(_aware(r["created_at"]) for r in recent) < timedelta(seconds=PHONE_RESEND_SECONDS):
        raise HTTPException(status_code=429, detail="Aspetta un minuto prima di chiedere un nuovo codice.")

    use_verify = sms.verify_enabled()
    pending = {
        "phone_code_expires": now + timedelta(minutes=PHONE_CODE_TTL_MINUTES),
        "phone_attempts": 0,
        "phone_pending_hash": phone_hash,
        "phone_pending_masked": mask_phone(phone),
        "phone_via_verify": use_verify,
    }
    code = generate_numeric_code()
    if not use_verify:
        pending["phone_code"] = hash_secret_value(code)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": pending, **({"$unset": {"phone_code": ""}} if use_verify else {})},
    )
    if use_verify:
        sent = await sms.verify_start(phone)
    else:
        sent = await sms.send_sms(phone, f"Scambio Favori - codice di verifica: {code} (vale {PHONE_CODE_TTL_MINUTES} minuti)")
    if not sent:
        # Un invio fallito non conta nel limite orario e non obbliga ad aspettare un minuto per riprovare
        raise HTTPException(status_code=503, detail="Non riesco a inviare l'SMS adesso. Riprova tra poco.")
    await db.phone_requests.insert_one({"user_id": current_user.user_id, "created_at": now})
    return {"message": "Codice inviato", "sms_sent": True}


@api_router.post("/auth/phone/verify", response_model=User)
@limiter.limit("10/minute")
async def verify_phone_code(request: Request, data: PhoneVerifyBody, current_user: User = Depends(get_current_user)):
    """Conferma il codice ricevuto via SMS: il profilo diventa "telefono verificato"."""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if user_doc.get("phone_via_verify"):
        await _check_code_with_twilio(user_doc, data)
    else:
        await check_one_time_code(
            user_doc,
            user_doc.get("phone_code"),
            hash_secret_value(data.code.strip()),
            "phone_attempts",
            ["phone_code", "phone_code_expires"],
        )
    expires = user_doc.get("phone_code_expires")
    if not expires or datetime.now(timezone.utc) > _aware(expires):
        raise HTTPException(status_code=400, detail="Codice scaduto. Richiedi un nuovo codice.")

    phone_hash = user_doc.get("phone_pending_hash")
    if await db.users.find_one({"phone_hash": phone_hash, "user_id": {"$ne": current_user.user_id}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Questo numero è già usato da un altro account")

    await db.users.update_one(
        {"user_id": current_user.user_id},
        {
            "$set": {
                "phone_verified": True,
                "phone_verified_at": datetime.now(timezone.utc),
                "phone_hash": phone_hash,
                "phone_masked": user_doc.get("phone_pending_masked"),
            },
            "$unset": {
                "phone_code": "", "phone_code_expires": "", "phone_attempts": "",
                "phone_pending_hash": "", "phone_pending_masked": "", "phone_via_verify": "",
            },
        },
    )
    updated = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0})
    updated["title"] = get_user_title(updated)
    if "credits" in updated:
        updated["granelli"] = updated.pop("credits")
    return User(**updated)


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
    user_doc = await db.users.find_one(email_match(data.email))
    if not user_doc:
        # Don't reveal if email exists
        return {"message": "Se l'email esiste, riceverai un codice di reset"}
    
    code = generate_numeric_code()

    await db.users.update_one(
        email_match(data.email),
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
            <h1 style="color: #2D5A3D; margin: 0;">Scambio Favori</h1>
            <p style="color: #B8D4C0; margin-top: 8px;">Reset Password</p>
        </div>
        <div style="background-color: #1A2E22; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #FFFFFF; margin: 0 0 8px 0;">Ciao <strong>{html.escape(user_doc['name'])}</strong>,</p>
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
                "subject": "Scambio Favori - Reset Password",
                "html": html_content,
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
            logger.info("Password reset email sent")
        except Exception as e:
            logger.error(f"Failed to send reset email: {str(e)}")
    
    if not email_sent:
        logger.warning("Password reset email not sent")
    
    return {"message": "Se l'email esiste, riceverai un codice di reset"}

@api_router.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, data: ResetPasswordRequest):
    """Reset password with verification code"""
    user_doc = await db.users.find_one(email_match(data.email))
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
        email_match(data.email),
        {
            "$set": {"password_hash": hashed, "sessions_valid_after": datetime.now(timezone.utc)},
            "$unset": {"reset_code": "", "reset_code_expires": ""}
        }
    )
    
    logger.info("Password reset successful")
    return {"message": "Password aggiornata con successo"}

@api_router.post("/auth/recover-username")
@limiter.limit("3/minute")
async def recover_username(request: Request, data: RecoverUsernameRequest):
    """Send username reminder via email"""
    user_doc = await db.users.find_one(email_match(data.email))
    if not user_doc:
        return {"message": "Se l'email esiste, riceverai il tuo nome utente"}
    
    code = generate_numeric_code()

    await db.users.update_one(
        email_match(data.email),
        {"$set": {
            "username_recovery_code": code,
            "username_recovery_attempts": 0,
            "username_recovery_expires": datetime.now(timezone.utc) + timedelta(hours=1)
        }}
    )
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background-color: #0F1A14; color: #FFFFFF; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D5A3D; margin: 0;">Scambio Favori</h1>
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
                "subject": "Scambio Favori - Recupero Nome Utente",
                "html": html_content,
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
            logger.info("Username recovery email sent")
        except Exception as e:
            logger.error(f"Failed to send username recovery email: {str(e)}")
    
    if not email_sent:
        logger.warning("Username recovery email not sent")
    
    return {"message": "Se l'email esiste, riceverai un codice di verifica"}

@api_router.post("/auth/verify-username-recovery")
@limiter.limit("5/minute")
async def verify_username_recovery(request: Request, data: VerifyUsernameRecoveryRequest):
    """Verify code and return username"""
    user_doc = await db.users.find_one(email_match(data.email))
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
        email_match(data.email),
        {"$unset": {"username_recovery_code": "", "username_recovery_expires": ""}}
    )
    
    return {"username": user_doc["name"], "message": f"Il tuo nome utente è: {user_doc['name']}"}

@api_router.post("/auth/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin, response: Response):
    """Login with email/password"""
    user_doc = await db.users.find_one(email_match(credentials.email), {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Email o password non validi")
    
    if "password_hash" not in user_doc:
        raise HTTPException(status_code=401, detail="Usa il login con Google per questo account")
    
    if not verify_password(credentials.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o password non validi")

    # Si entra solo con un'email verificata. Dopo la password giusta si rimanda il codice (al massimo uno al minuto).
    if not user_doc.get("email_verified"):
        expires = user_doc.get("verification_code_expires")
        if isinstance(expires, datetime) and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        just_sent = isinstance(expires, datetime) and expires - datetime.now(timezone.utc) > timedelta(minutes=59)
        if not just_sent:
            new_code = generate_numeric_code()
            await db.users.update_one(
                {"user_id": user_doc["user_id"]},
                {"$set": {
                    "verification_code": new_code,
                    "verification_attempts": 0,
                    "verification_code_expires": datetime.now(timezone.utc) + timedelta(hours=1),
                }},
            )
            await send_verification_email(user_doc["email"], new_code, user_doc.get("name", ""))
        raise HTTPException(
            status_code=403,
            detail="Devi prima verificare la tua email: ti abbiamo mandato un codice.",
            headers={"X-Email-Unverified": "true", "X-User-Id": user_doc["user_id"]},
        )

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
        samesite="lax",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return AuthResponse(user=User(**user_doc), token=token)

class GoogleLoginBody(BaseModel):
    id_token: str = Field(max_length=4096)
    nonce: str = Field(max_length=200)


@api_router.get("/auth/google/nonce")
@limiter.limit("30/minute")
async def google_nonce(request: Request):
    """Nonce monouso da mettere nella richiesta a Google; serve a legare il token all'app che l'ha chiesto."""
    return {"nonce": google_auth.make_nonce(JWT_SECRET), "enabled": bool(google_auth.GOOGLE_CLIENT_IDS)}


@api_router.post("/auth/google")
@limiter.limit("10/minute")
async def google_login(request: Request, body: GoogleLoginBody, response: Response):
    """Accesso con Google: l'ID token viene verificato qui (firma, destinatario, scadenza, nonce)."""
    nonce = google_auth.check_nonce_format(JWT_SECRET, body.nonce)
    await db.google_nonces.delete_many({"created_at": {"$lt": datetime.now(timezone.utc) - timedelta(hours=1)}})
    try:
        await db.google_nonces.insert_one({"_id": nonce, "created_at": datetime.now(timezone.utc)})
    except Exception:  # nonce già usato
        raise HTTPException(status_code=401, detail="Accesso con Google non valido")
    identity = await google_auth.verify_google_id_token(body.id_token, nonce)
    email, name, picture = identity["email"], identity["name"], identity["picture"]
    session_token = secrets.token_urlsafe(32)

    user_doc = await db.users.find_one(email_match(email), {"_id": 0})
    
    if user_doc:
        user_id = user_doc["user_id"]
        # Google ha verificato l'email. Se è l'email di un moderatore, una password messa da chi si era registrato
        # prima con quell'indirizzo non deve restare valida.
        from routers.moderation_routes import is_moderator_account
        update = {"$set": {"name": name, "picture": picture, "identity_verified": True, "email_verified": True}}
        if not user_doc.get("email_verified") or (is_moderator_account(email, True) and user_doc.get("password_hash")):
            # Account creato con questa email ma mai verificata: chi lo aveva registrato non deve restare dentro
            # (via la password e via le sessioni vecchie). Vale per tutti, non solo per i moderatori.
            update["$set"]["sessions_valid_after"] = datetime.now(timezone.utc)
            update["$unset"] = {"password_hash": ""}
        await db.users.update_one({"user_id": user_id}, update)
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
            "email_verified": True,
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
        samesite="lax",
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
        user_doc = await db.users.find_one({"$or": [email_match(email), {"apple_user_id": apple_user_id}]}, {"_id": 0})
        
        if user_doc:
            user_id = user_doc["user_id"]
            # Update Apple user ID if not set
            if not user_doc.get("apple_user_id"):
                apple_update = {"$set": {"apple_user_id": apple_user_id, "identity_verified": True}}
                if not user_doc.get("email_verified"):
                    # Stessa difesa del login Google: email mai verificata, la vecchia password non resta valida.
                    apple_update["$set"].update({"email_verified": True, "sessions_valid_after": datetime.now(timezone.utc)})
                    apple_update["$unset"] = {"password_hash": ""}
                await db.users.update_one({"user_id": user_id}, apple_update)
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
