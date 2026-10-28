"""Shared configuration, models, helpers and services (everything that is not an HTTP route)."""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import tempfile
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import math
import secrets
import random
import base64
import qrcode
from io import BytesIO
import resend

# Stripe integration
import stripe as _stripe

ROOT_DIR = Path(__file__).parent
# override=False ensures Kubernetes env vars are NOT overwritten by .env file
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
class _LazyDB:
    """Indirection so tests (and future pooling changes) can swap the database without re-importing."""

    def __init__(self, database):
        self._database = database

    def __getattr__(self, name):
        return getattr(self._database, name)


db = _LazyDB(client[os.environ['DB_NAME']])

# JWT Config - Use env var in production, default for local development
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    # Secure by default on any host: only an explicit ENVIRONMENT=development may use the dev secret.
    if os.environ.get('ENVIRONMENT') != 'development':
        raise RuntimeError("JWT_SECRET must be set (or set ENVIRONMENT=development for local use)")
    JWT_SECRET = 'local-dev-secret-key-not-for-production'
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Stripe Config - Use env var, with test key fallback for local development
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

# OAuth Config
OAUTH_SESSION_URL = os.environ.get('OAUTH_SESSION_URL', 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data')

# Resend Email Config
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# Rate limiting (per client IP; uvicorn runs with --proxy-headers behind Railway)
limiter = Limiter(key_func=get_remote_address)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
    logger.info("Resend email service configured")
else:
    logger.warning("RESEND_API_KEY not set - email verification will log codes only")

# ========================
# CONSTANTS - CURRENCY "GRANELLI" 💎
# ========================

WELCOME_GRANELLI = 3  # Granelli di Benvenuto
REFERRAL_BONUS = 2  # Bonus referral etico
GRANELLI_PER_HOUR = 1  # 1 ora = 1 granello

CURRENCY_NAME = "Granelli"  # "Ogni favore fatto è un granello di sabbia che costruisce la community"
CURRENCY_SYMBOL = "💎"

# Privacy: approximate location radius in meters
PRIVACY_RADIUS_METERS = 200

# Geofencing: max distance for QR exchange
MAX_EXCHANGE_DISTANCE_METERS = 100

# ========================
# SOCIAL DEBT LIMIT SYSTEM
# ========================

DEBT_LIMIT = -3  # Max negative balance allowed
INACTIVITY_DAYS = 15  # Days before reliability drops
RELIABILITY_DROP_RATE = 0.5  # How much reliability drops per check

# ========================
# CHAT MESSAGE FILTER (Anti-Money)
# ========================
import re

# Regex patterns to block real money transactions
MONEY_FILTER_PATTERNS = [
    r'\b\d+\s*€',  # 50€, 100 €
    r'€\s*\d+',    # €50, € 100
    r'\b\d+\s*euro\b',  # 50 euro
    r'\beuro\s*\d+',    # euro 50
    r'\b\d+\s*EUR\b',   # 50 EUR
    r'\bpagamento\b',   # pagamento
    r'\bpagare\b',      # pagare
    r'\bsoldi\b',       # soldi
    r'\bcontanti\b',    # contanti
    r'\bbonifico\b',    # bonifico
    r'\bpaypal\b',      # paypal
    r'\biban\b',        # iban
    r'\bcarta\s*(di\s*credito|di\s*debito)?\b',  # carta, carta di credito
    r'\bbancomat\b',    # bancomat
    r'\bsatispay\b',    # satispay
    r'\brevolut\b',     # revolut
    r'\bpostepay\b',    # postepay
    r'\btrasferimento\s*(bancario|denaro)?\b',  # trasferimento
    r'\bcompenso\b',    # compenso
    r'\btariffa\b',     # tariffa
    r'\bprezzo\b',      # prezzo
    r'\bcosto\b',       # costo (in money context)
    r'\b\d+\s*dollari?\b',  # dollari
    r'\$\s*\d+',        # $50
    r'\b\d+\s*\$',      # 50$
]

# Offensive language filter patterns
OFFENSIVE_PATTERNS = [
    r'\bstronz[oa]?\b',
    r'\bcoglion[ei]?\b',
    r'\bvaffanculo\b',
    r'\bminchia\b',
    r'\bcazz[oa]?\b',
    r'\bfottit[io]\b',
    r'\bputtana?\b',
    r'\btroia\b',
    r'\bbastard[oa]?\b',
    r'\bidiota\b',
    r'\bimbecille\b',
    r'\bdeficiente\b',
    r'\bscemo\b',
    r'\bmer[d]+a\b',
    r'\bfanculo\b',
]

# Personal data patterns for privacy alerts
PERSONAL_DATA_PATTERNS = {
    'phone': r'(\+?\d{2,3}[\s.-]?)?\d{3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}',
    'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
}

def contains_money_reference(text: str) -> bool:
    """Check if text contains references to real money transactions"""
    text_lower = text.lower()
    for pattern in MONEY_FILTER_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False

def contains_offensive_language(text: str) -> bool:
    """Check if text contains offensive language"""
    text_lower = text.lower()
    for pattern in OFFENSIVE_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False

def contains_personal_data(text: str) -> dict:
    """Check if text contains personal data (phone, email)"""
    result = {'has_personal_data': False, 'types': []}
    for data_type, pattern in PERSONAL_DATA_PATTERNS.items():
        if re.search(pattern, text):
            result['has_personal_data'] = True
            result['types'].append(data_type)
    return result

def is_suspicious_link(text: str) -> bool:
    """Check if text contains suspicious links"""
    # Block most external links except common safe ones
    link_pattern = r'https?://[^\s]+'
    safe_domains = ['maps.google', 'goo.gl/maps', 'openstreetmap']
    
    links = re.findall(link_pattern, text.lower())
    for link in links:
        is_safe = any(domain in link for domain in safe_domains)
        if not is_safe:
            return True
    return False

def moderate_content(text: str) -> dict:
    """
    Content moderation for favor creation (Store Compliance)
    Returns: {"allowed": bool, "reason": str or None, "warnings": list}
    """
    warnings = []
    
    # Check for offensive language
    if contains_offensive_language(text):
        return {
            "allowed": False,
            "reason": "Il testo contiene linguaggio offensivo",
            "warnings": ["offensive_language"]
        }
    
    # Check for suspicious links
    if is_suspicious_link(text):
        return {
            "allowed": False,
            "reason": "Non sono ammessi link esterni (eccetto mappe)",
            "warnings": ["suspicious_link"]
        }
    
    # Check for money references (warning only for favors, but allowed)
    if contains_money_reference(text):
        warnings.append("money_reference")
    
    # Check for personal data (warning only)
    personal_data = contains_personal_data(text)
    if personal_data['has_personal_data']:
        warnings.append(f"personal_data:{','.join(personal_data['types'])}")
    
    return {
        "allowed": True,
        "reason": None,
        "warnings": warnings
    }

# ========================
# EMAIL SENDING HELPER
# ========================

async def send_verification_email(to_email: str, code: str, user_name: str):
    """Send verification email via Resend"""
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL MOCK] Verification code for {to_email}: {code}")
        return False
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background-color: #0F1A14; color: #FFFFFF; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D5A3D; margin: 0;">Scambio di Favori</h1>
            <p style="color: #B8D4C0; margin-top: 8px;">Verifica il tuo account</p>
        </div>
        <div style="background-color: #1A2E22; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #FFFFFF; margin: 0 0 8px 0;">Ciao <strong>{user_name}</strong>,</p>
            <p style="color: #B8D4C0; margin: 0 0 20px 0;">Usa questo codice per verificare il tuo indirizzo email:</p>
            <div style="text-align: center; background-color: #0F1A14; padding: 16px; border-radius: 8px; border: 2px solid #2D5A3D;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #FFD700;">{code}</span>
            </div>
            <p style="color: #7A9F85; font-size: 12px; margin-top: 16px; text-align: center;">Il codice scade tra 1 ora</p>
        </div>
        <p style="color: #7A9F85; font-size: 12px; text-align: center;">Se non hai richiesto questa verifica, ignora questa email.</p>
    </div>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": "Scambio di Favori - Codice di Verifica",
        "html": html_content,
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Verification email sent to {to_email}, id: {email.get('id', 'unknown')}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email to {to_email}: {str(e)}")
        return False


# Badge definitions
BADGES = {
    "cuore_oro": {
        "id": "cuore_oro",
        "name": "Cuore d'Oro",
        "description": f"Hai donato almeno 10 {CURRENCY_NAME} al Fondo Solidarietà",
        "icon": "heart",
        "color": "#ffd700",
        "requirement": {"type": "donations", "value": 10}
    },
    "pilastro_quartiere": {
        "id": "pilastro_quartiere",
        "name": "Pilastro del Quartiere",
        "description": "Hai completato 20 favori nella tua zona",
        "icon": "home",
        "color": "#4ecca3",
        "requirement": {"type": "favors_completed", "value": 20}
    },
    "saggio_community": {
        "id": "saggio_community",
        "name": "Saggio della Community",
        "description": "Hai ricevuto 10 recensioni con valutazione massima",
        "icon": "school",
        "color": "#9c27b0",
        "requirement": {"type": "perfect_reviews", "value": 10}
    },
    "mentore": {
        "id": "mentore",
        "name": "Mentore",
        "description": "Hai invitato 5 persone che hanno completato il primo favore",
        "icon": "people",
        "color": "#2196f3",
        "requirement": {"type": "referrals", "value": 5}
    },
    "fulmine": {
        "id": "fulmine",
        "name": "Fulmine",
        "description": "Hai completato 10 micro-favori",
        "icon": "flash",
        "color": "#ff9800",
        "requirement": {"type": "micro_favors", "value": 10}
    },
    "primo_passo": {
        "id": "primo_passo",
        "name": "Primo Passo",
        "description": "Hai completato il tuo primo favore",
        "icon": "footsteps",
        "color": "#4caf50",
        "requirement": {"type": "first_favor", "value": 1}
    },
    "angelo_quartiere": {
        "id": "angelo_quartiere",
        "name": "Angelo del Quartiere",
        "description": "Hai risposto a 5 Emergenze Gentilezza",
        "icon": "sunny",
        "color": "#e91e63",
        "requirement": {"type": "emergencies_helped", "value": 5}
    },
    "vicino_virtuoso": {
        "id": "vicino_virtuoso",
        "name": "Vicino Virtuoso",
        "description": "Rating medio superiore a 4.5 stelle con almeno 10 recensioni",
        "icon": "ribbon",
        "color": "#00bcd4",
        "requirement": {"type": "high_rating", "value": 4.5}
    },
    "eroe_quartiere": {
        "id": "eroe_quartiere",
        "name": "Eroe di Quartiere",
        "description": "Hai completato 5 favori - Accesso al Fondo Solidarietà sbloccato!",
        "icon": "sunny",
        "color": "#ffd700",
        "requirement": {"type": "favors_completed", "value": 5}
    }
}

# User role titles based on stats
def get_user_title(user_doc: dict) -> str:
    """Get user's community title based on their stats"""
    badges = user_doc.get("badges", [])
    rating = user_doc.get("average_rating", 0)
    emergencies = user_doc.get("emergencies_helped", 0)
    
    if "angelo_quartiere" in badges:
        return "Angelo del Quartiere"
    elif "vicino_virtuoso" in badges or rating >= 4.5:
        return "Vicino Virtuoso"
    elif len(badges) >= 3:
        return "Membro Attivo"
    else:
        return "Nuovo Vicino"

# ========================
# MODELS
# ========================

class UserBase(BaseModel):
    email: str
    name: str

MIN_PASSWORD_LENGTH = 8

class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    referral_code: Optional[str] = None

    @field_validator("email")
    @classmethod
    def strip_email(cls, value: str) -> str:
        return value.strip()

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Il nome deve avere almeno 2 caratteri")
        return cleaned

class UserLogin(BaseModel):
    email: str
    password: str

class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    color: str
    earned_at: Optional[datetime] = None

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    granelli: int = WELCOME_GRANELLI  # Currency renamed to Granelli
    total_favors_given: int = 0
    total_favors_received: int = 0
    micro_favors_completed: int = 0
    emergencies_helped: int = 0
    total_hours_helped: float = 0.0
    total_donations: int = 0
    average_rating: float = 0.0
    average_kindness: float = 0.0
    average_impact: float = 0.0
    perfect_reviews_count: int = 0
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    successful_referrals: int = 0
    badges: List[str] = []
    title: str = "Nuovo Vicino"
    is_vulnerable: bool = False
    identity_verified: bool = False
    community_score: int = 0
    social_impact_score: int = 0  # New: Social Impact Bar
    can_access_solidarity_fund: bool = False
    # Supporter subscription status
    is_supporter: bool = False
    # Competenze utente per matching notifiche
    skills: List[str] = []  # Lista di categorie in cui l'utente è competente
    notifications_enabled: bool = True
    # GDPR & Legal Compliance
    legal_accepted: bool = False  # Accettazione Termini e Privacy
    legal_accepted_at: Optional[datetime] = None
    # Social Debt Limit System
    reliability_score: float = 5.0  # 1-5 scale, starts at 5
    debt_start_date: Optional[datetime] = None  # When user went into debt
    last_activity_date: Optional[datetime] = None  # Last app activity
    in_debt_recovery: bool = False  # Using solidarity fund for recovery
    # Privacy: approximate location for public display
    approximate_latitude: Optional[float] = None
    approximate_longitude: Optional[float] = None
    created_at: Optional[datetime] = None

class FavorCategory(BaseModel):
    name: str
    icon: str

FAVOR_CATEGORIES = [
    {"name": "Trasporto", "icon": "car"},
    {"name": "Spesa", "icon": "cart"},
    {"name": "Tecnologia", "icon": "laptop"},
    {"name": "Pulizie", "icon": "home"},
    {"name": "Compagnia", "icon": "people"},
    {"name": "Cucina", "icon": "restaurant"},
    {"name": "Giardinaggio", "icon": "leaf"},
    {"name": "Babysitting", "icon": "happy"},
    {"name": "Animali", "icon": "paw"},
    {"name": "Ripetizioni", "icon": "school"},
    {"name": "Altro", "icon": "ellipsis-horizontal"},
]

# Object categories for Oggettoteca
OBJECT_CATEGORIES = [
    {"name": "Utensili", "icon": "heart-circle"},
    {"name": "Cucina", "icon": "heart-circle-outline"},
    {"name": "Giardino", "icon": "leaf"},
    {"name": "Sport", "icon": "heart-half"},
    {"name": "Elettronica", "icon": "heart"},
    {"name": "Bambini", "icon": "people"},
    {"name": "Fai da te", "icon": "home"},
    {"name": "Altro", "icon": "heart-outline"},
]

class FavorCreate(BaseModel):
    type: str  # "offer" or "request"
    title: str
    description: str
    category: str
    duration_hours: float = 1.0
    validity_days: int = 3  # Durata annuncio (1-10 giorni, default 3)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    is_emergency: bool = False  # Emergenza Gentilezza

class Favor(BaseModel):
    favor_id: str
    creator_id: str
    creator_name: str
    creator_title: str = "Nuovo Vicino"
    creator_is_supporter: bool = False  # For golden badge display
    type: str
    title: str
    description: str
    category: str
    duration_hours: float
    granelli_cost: int = 1  # Default to 1 if not present
    validity_days: int = 3  # Durata annuncio
    expires_at: Optional[datetime] = None  # Data scadenza annuncio
    status: str = "active"
    accepted_by: Optional[str] = None
    accepted_by_name: Optional[str] = None
    # Privacy: only show approximate location publicly
    approximate_latitude: Optional[float] = None
    approximate_longitude: Optional[float] = None
    # Exact location only shared after acceptance
    exact_latitude: Optional[float] = None
    exact_longitude: Optional[float] = None
    address: Optional[str] = None
    distance_km: Optional[float] = None
    is_emergency: bool = False
    creator_in_debt: bool = False  # For priority highlighting in feed
    qr_code: Optional[str] = None
    checkin_completed: bool = False
    created_at: datetime
    completed_at: Optional[datetime] = None

# Oggettoteca Models
class ObjectCreate(BaseModel):
    name: str
    description: str
    category: str
    deposit_soli: int = 2  # Deposito cauzionale in Soli
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class LendableObject(BaseModel):
    object_id: str
    owner_id: str
    owner_name: str
    owner_title: str = "Nuovo Vicino"
    name: str
    description: str
    category: str
    deposit_soli: int
    status: str = "available"  # available, borrowed, unavailable
    borrowed_by: Optional[str] = None
    borrowed_by_name: Optional[str] = None
    approximate_latitude: Optional[float] = None
    approximate_longitude: Optional[float] = None
    distance_km: Optional[float] = None
    borrow_date: Optional[datetime] = None
    return_date: Optional[datetime] = None
    created_at: datetime

class BorrowRequest(BaseModel):
    object_id: str

class ReturnObject(BaseModel):
    object_id: str
    condition: str = "good"  # good, damaged

# Wall Post (Muro del Quartiere)
class WallPostCreate(BaseModel):
    content: str
    post_type: str = "general"  # general, thanks, announcement
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class WallPost(BaseModel):
    post_id: str
    author_id: str
    author_name: str
    author_title: str = "Nuovo Vicino"
    content: str
    post_type: str
    likes: int = 0
    liked_by: List[str] = []
    approximate_latitude: Optional[float] = None
    approximate_longitude: Optional[float] = None
    distance_km: Optional[float] = None
    created_at: datetime

# Ethical tags for reviews
ETHICAL_TAGS = [
    {"id": "educato", "label": "È stato molto educato", "icon": "heart"},
    {"id": "pulito", "label": "Ha lasciato tutto pulito", "icon": "sparkles"},
    {"id": "puntuale", "label": "Puntuale e affidabile", "icon": "time"},
    {"id": "comunicativo", "label": "Comunicazione chiara", "icon": "chatbubble"},
    {"id": "generoso", "label": "Generoso e disponibile", "icon": "gift"},
    {"id": "professionale", "label": "Molto professionale", "icon": "briefcase"},
    {"id": "simpatico", "label": "Simpatico e cordiale", "icon": "happy"},
    {"id": "rispettoso", "label": "Rispettoso degli spazi", "icon": "home"},
]

class FavorAccept(BaseModel):
    favor_id: str

class FavorComplete(BaseModel):
    favor_id: str
    qr_code: Optional[str] = None
    # User's current location for proximity check
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ReviewCreate(BaseModel):
    favor_id: str
    rating: int
    kindness_rating: int = 5
    impact_rating: int = 5
    ethical_tags: List[str] = []  # List of ethical tag IDs
    comment: Optional[str] = None
    public_thanks: Optional[str] = None  # For Bacheca dei Grazie

class Review(BaseModel):
    review_id: str
    favor_id: str
    reviewer_id: str
    reviewer_name: str
    reviewed_id: str
    rating: int
    kindness_rating: int
    impact_rating: int
    ethical_tags: List[str] = []  # List of ethical tag IDs
    comment: Optional[str] = None
    public_thanks: Optional[str] = None
    created_at: datetime

class DonationCreate(BaseModel):
    amount: int
    recipient_id: Optional[str] = None
    message: Optional[str] = None

class Donation(BaseModel):
    donation_id: str
    donor_id: str
    donor_name: str
    recipient_id: Optional[str]
    recipient_name: Optional[str]
    amount: int
    message: Optional[str]
    is_solidarity_fund: bool
    created_at: datetime

# Bacheca dei Grazie
class ThanksEntry(BaseModel):
    thanks_id: str
    favor_id: str
    favor_title: str
    giver_id: str
    giver_name: str
    receiver_id: str
    receiver_name: str
    message: str
    created_at: datetime

# ========================
# CHAT MESSAGES
# ========================

class MeetingPoint(BaseModel):
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = None

class MessageCreate(BaseModel):
    favor_id: str
    content: str
    message_type: Optional[str] = "text"  # text, meeting_point, image
    meeting_point: Optional[MeetingPoint] = None

class Message(BaseModel):
    message_id: str
    favor_id: str
    sender_id: str
    sender_name: str
    content: str
    message_type: str = "text"
    meeting_point: Optional[MeetingPoint] = None
    is_system: bool = False  # For system messages (blocked, etc.)
    blocked: bool = False  # If message was blocked by filter
    has_personal_data: bool = False  # If message contains phone/email
    created_at: datetime

class AuthResponse(BaseModel):
    user: User
    token: str

# Il Nostro Patto
PATTO_CONTENT = {
    "title": "Il Nostro Patto",
    "subtitle": "I valori che ci guidano come comunità",
    "encouraged": [
        {
            "title": "Puntualità",
            "icon": "time",
            "description": "Se accetti un favore, rispetta l'impegno. Il tempo degli altri è sacro."
        },
        {
            "title": "Trasparenza",
            "icon": "eye",
            "description": "Sii chiaro su cosa puoi fare e cosa no. Non serve essere supereroi, basta essere onesti."
        },
        {
            "title": "Reciprocità",
            "icon": "sync",
            "description": f"L'app vive se tutti danno e ricevono. Non accumulare {CURRENCY_NAME} senza mai spenderli, e non spendere senza mai offrire."
        },
        {
            "title": "Gentilezza",
            "icon": "heart",
            "description": "Ogni interazione è un'opportunità per rendere il quartiere un posto migliore."
        }
    ],
    "forbidden": [
        {
            "title": "Sfruttamento Professionale",
            "icon": "briefcase",
            "description": "L'app non serve a trovare manovalanza gratuita per la tua azienda. È per aiuti personali e spontanei."
        },
        {
            "title": "Scambio di Denaro",
            "icon": "cash",
            "description": f"È severamente vietato chiedere o offrire euro all'interno della piattaforma. Usiamo solo il tempo ({CURRENCY_NAME})."
        },
        {
            "title": "Maleducazione",
            "icon": "alert-circle",
            "description": "Comportamenti irrispettosi portano all'esclusione immediata dalla community. Proteggiamo la nostra armonia."
        }
    ],
    "currency_explanation": {
        "name": CURRENCY_NAME,
        "symbol": CURRENCY_SYMBOL,
        "meaning": "Ogni favore fatto è un raggio di sole che illumina il quartiere. I Soli rappresentano il tempo e l'energia che doniamo agli altri.",
        "exchange_rate": f"1 ora = 1 {CURRENCY_NAME[:-1]}e"
    }
}

# ========================
# AUTH HELPERS
# ========================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

MAX_CODE_ATTEMPTS = 5

def generate_numeric_code(length: int = 6) -> str:
    """Cryptographically secure numeric one-time code."""
    return ''.join(secrets.choice('0123456789') for _ in range(length))

async def check_one_time_code(user_doc: dict, stored_code, provided_code: str,
                              attempts_field: str, code_fields: list) -> None:
    """Validate a one-time code with a bounded number of attempts.

    Raises HTTPException(400) on mismatch; after MAX_CODE_ATTEMPTS failures the
    code is invalidated so a 6-digit code cannot be brute-forced.
    """
    query = {"user_id": user_doc["user_id"]}
    attempts = user_doc.get(attempts_field, 0)
    if not stored_code or attempts >= MAX_CODE_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Codice non valido. Richiedi un nuovo codice.")
    if not secrets.compare_digest(str(stored_code), str(provided_code)):
        update = {"$inc": {attempts_field: 1}}
        if attempts + 1 >= MAX_CODE_ATTEMPTS:
            update["$unset"] = {field: "" for field in code_fields}
        await db.users.update_one(query, update)
        raise HTTPException(status_code=400, detail="Codice non valido")

def generate_referral_code() -> str:
    return secrets.token_urlsafe(6).upper()[:8]

def generate_qr_code() -> str:
    """Generate a unique QR code token"""
    return secrets.token_urlsafe(16)

def generate_qr_image(data: str, favor_id: str = None) -> str:
    """Generate a beautiful QR code image as base64 string"""
    # Create QR code with custom styling
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction for logo overlay
        box_size=10,
        border=2,
    )
    
    # Create data payload with favor info
    payload = {
        "type": "scambio_favori",
        "code": data,
        "favor_id": favor_id,
        "app": "Scambio di Favori"
    }
    qr.add_data(str(payload))
    qr.make(fit=True)
    
    # Create image with custom colors (Forest Green theme)
    img = qr.make_image(
        fill_color="#2D5A3D",  # Forest green
        back_color="#FFFFFF"   # White background
    )
    
    # Convert to base64
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return f"data:image/png;base64,{img_base64}"

async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    
    user_id = decode_jwt_token(session_token)
    if user_id:
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user_doc:
            user_doc["title"] = get_user_title(user_doc)
            # Rename credits to soli for backwards compatibility
            if "credits" in user_doc:
                user_doc["granelli"] = user_doc.pop("credits")
            return User(**user_doc)
    
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Sessione non valida")
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sessione scaduta")
    
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    
    user_doc["title"] = get_user_title(user_doc)
    if "credits" in user_doc:
        user_doc["granelli"] = user_doc.pop("credits")
    return User(**user_doc)

# ========================
# UTILITY FUNCTIONS
# ========================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km using Haversine formula"""
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def approximate_location(lat: float, lon: float, radius_meters: int = PRIVACY_RADIUS_METERS) -> tuple:
    """
    Add random offset to create approximate location for privacy.
    Returns (approx_lat, approx_lon)
    """
    # Convert radius from meters to degrees (approximately)
    radius_deg = radius_meters / 111000  # 1 degree ≈ 111km
    
    # Random angle and distance
    angle = random.uniform(0, 2 * math.pi)
    distance = random.uniform(0, radius_deg)
    
    offset_lat = distance * math.cos(angle)
    offset_lon = distance * math.sin(angle) / math.cos(math.radians(lat))
    
    return (lat + offset_lat, lon + offset_lon)

async def check_and_award_badges(user_id: str):
    """Check if user earned new badges"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    
    current_badges = user_doc.get("badges", [])
    new_badges = []
    
    # Get review count for high_rating badge
    review_count = await db.reviews.count_documents({"reviewed_id": user_id})
    
    for badge_id, badge_info in BADGES.items():
        if badge_id in current_badges:
            continue
        
        req = badge_info["requirement"]
        earned = False
        
        if req["type"] == "donations" and user_doc.get("total_donations", 0) >= req["value"]:
            earned = True
        elif req["type"] == "favors_completed":
            total = user_doc.get("total_favors_given", 0) + user_doc.get("total_favors_received", 0)
            if total >= req["value"]:
                earned = True
                # GAMIFICATION: Eroe di Quartiere unlocks Solidarity Fund access
                if badge_id == "eroe_quartiere":
                    await db.users.update_one(
                        {"user_id": user_id},
                        {"$set": {"can_access_solidarity_fund": True}}
                    )
        elif req["type"] == "perfect_reviews" and user_doc.get("perfect_reviews_count", 0) >= req["value"]:
            earned = True
        elif req["type"] == "referrals" and user_doc.get("successful_referrals", 0) >= req["value"]:
            earned = True
        elif req["type"] == "micro_favors" and user_doc.get("micro_favors_completed", 0) >= req["value"]:
            earned = True
        elif req["type"] == "first_favor":
            total = user_doc.get("total_favors_given", 0) + user_doc.get("total_favors_received", 0)
            if total >= req["value"]:
                earned = True
        elif req["type"] == "emergencies_helped" and user_doc.get("emergencies_helped", 0) >= req["value"]:
            earned = True
        elif req["type"] == "high_rating":
            if review_count >= 10 and user_doc.get("average_rating", 0) >= req["value"]:
                earned = True
        
        if earned:
            new_badges.append(badge_id)
    
    if new_badges:
        await db.users.update_one(
            {"user_id": user_id},
            {"$push": {"badges": {"$each": new_badges}}}
        )

async def update_community_score(user_id: str):
    """Update user's community score"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    
    score = 0
    score += user_doc.get("total_favors_given", 0) * 10
    score += user_doc.get("total_favors_received", 0) * 5
    score += user_doc.get("total_donations", 0) * 15
    score += user_doc.get("successful_referrals", 0) * 20
    score += user_doc.get("emergencies_helped", 0) * 25
    score += len(user_doc.get("badges", [])) * 25
    score += int(user_doc.get("average_rating", 0) * 10)
    score += int(user_doc.get("average_kindness", 0) * 10)
    score += int(user_doc.get("average_impact", 0) * 10)
    
    # Calculate Social Impact Score (for the Social Impact Bar)
    total_favors = user_doc.get("total_favors_given", 0) + user_doc.get("total_favors_received", 0)
    social_impact = total_favors * 20  # 20 points per favor
    social_impact += user_doc.get("emergencies_helped", 0) * 50  # 50 points per emergency
    social_impact += user_doc.get("total_donations", 0) * 10  # 10 points per donation
    social_impact += int(user_doc.get("total_hours_helped", 0) * 15)  # 15 points per hour helped
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"community_score": score, "social_impact_score": social_impact}}
    )

# ========================
# SOCIAL DEBT LIMIT SYSTEM
# ========================

async def check_debt_status(user_id: str) -> dict:
    """Check user's debt status and update accordingly"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return {"can_request": True, "in_debt": False}
    
    granelli = user_doc.get("granelli", 0)
    in_debt = granelli < 0
    can_request = granelli > DEBT_LIMIT
    
    # Track debt start date
    if in_debt and not user_doc.get("debt_start_date"):
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"debt_start_date": datetime.now(timezone.utc)}}
        )
    elif not in_debt and user_doc.get("debt_start_date"):
        # User recovered from debt - clear debt date
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"debt_start_date": None, "in_debt_recovery": False}}
        )
    
    return {
        "can_request": can_request,
        "in_debt": in_debt,
        "granelli": granelli,
        "debt_limit": DEBT_LIMIT
    }

async def check_reliability_decay(user_id: str):
    """Check if user's reliability should decay due to inactivity while in debt"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    
    granelli = user_doc.get("granelli", 0)
    debt_start = user_doc.get("debt_start_date")
    last_activity = user_doc.get("last_activity_date")
    reliability = user_doc.get("reliability_score", 5.0)
    
    if granelli >= 0 or not debt_start:
        return  # Not in debt
    
    # Check if user has been inactive for INACTIVITY_DAYS while in debt
    if last_activity:
        days_inactive = (datetime.now(timezone.utc) - last_activity).days
        if days_inactive >= INACTIVITY_DAYS and reliability > 1.0:
            new_reliability = max(1.0, reliability - RELIABILITY_DROP_RATE)
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"reliability_score": new_reliability}}
            )

async def update_last_activity(user_id: str):
    """Update user's last activity timestamp"""
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_activity_date": datetime.now(timezone.utc)}}
    )

async def check_return_to_positive(user_id: str, old_balance: int, new_balance: int) -> bool:
    """Check if user just returned to positive balance"""
    if old_balance < 0 and new_balance >= 0:
        # User returned to positive - this is a celebration moment
        return True
    return False

class EmailVerifyRequest(BaseModel):
    user_id: str
    code: str

class ResendCodeRequest(BaseModel):
    user_id: str

# ========================
# PASSWORD & USERNAME RECOVERY
# ========================

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

class RecoverUsernameRequest(BaseModel):
    email: str

class VerifyUsernameRecoveryRequest(BaseModel):
    email: str
    code: str

class AppleAuthRequest(BaseModel):
    identity_token: str
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None

# ========================
# SECURITY & ANTI-FRAUD SYSTEM
# ========================

MAX_DAILY_HOURS = 10  # Maximum hours that can be exchanged per day per user

async def check_daily_hours_limit(user_id: str) -> dict:
    """Check if user has exceeded daily hours limit (anti-fraud measure)"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get all completed favors today where user was involved
    today_favors = await db.favors.find({
        "status": "completed",
        "completed_at": {"$gte": today_start},
        "$or": [
            {"creator_id": user_id},
            {"accepted_by": user_id}
        ]
    }, {"_id": 0, "duration_hours": 1}).to_list(100)
    
    total_hours_today = sum(f.get("duration_hours", 0) for f in today_favors)
    
    return {
        "total_hours_today": total_hours_today,
        "remaining_hours": max(0, MAX_DAILY_HOURS - total_hours_today),
        "limit_exceeded": total_hours_today >= MAX_DAILY_HOURS
    }

async def log_security_transaction(
    favor_id: str,
    creator_id: str,
    accepted_by: str,
    duration_hours: float,
    granelli_cost: int,
    latitude: float = None,
    longitude: float = None,
    qr_code: str = None
):
    """Log QR transaction for security/legal purposes (internal only)"""
    import hashlib
    
    transaction_data = f"{favor_id}:{creator_id}:{accepted_by}:{datetime.now(timezone.utc).isoformat()}"
    transaction_hash = hashlib.sha256(transaction_data.encode()).hexdigest()[:32]
    
    security_log = {
        "log_id": f"seclog_{uuid.uuid4().hex[:12]}",
        "transaction_hash": transaction_hash,
        "favor_id": favor_id,
        "creator_id": creator_id,
        "accepted_by": accepted_by,
        "duration_hours": duration_hours,
        "granelli_cost": granelli_cost,
        "gps_latitude": latitude,
        "gps_longitude": longitude,
        "qr_code_used": qr_code,
        "timestamp": datetime.now(timezone.utc),
        "ip_address": None,  # Can be added if needed
        "device_info": None  # Can be added if needed
    }
    
    await db.security_logs.insert_one(security_log)
    return transaction_hash

def favor_parties(favor: "Favor") -> tuple:
    """Return (helper_id, payer_id): the helper earns granelli, the payer receives the service."""
    if favor.type == "offer":
        return favor.creator_id, favor.accepted_by
    return favor.accepted_by, favor.creator_id

async def settle_favor(favor: "Favor", extra_fields: Optional[dict] = None) -> tuple:
    """Atomically complete a favor and move granelli from payer to helper.

    1. Claim accepted -> completed (only one concurrent caller wins).
    2. Debit the payer only if the balance covers the cost (never negative).
    3. Credit the helper. If the debit fails the claim is rolled back.
    Returns (helper_id, payer_id).
    """
    helper_id, payer_id = favor_parties(favor)
    now = datetime.now(timezone.utc)
    claimed = await db.favors.find_one_and_update(
        {"favor_id": favor.favor_id, "status": "accepted"},
        {"$set": {"status": "completed", "completed_at": now, **(extra_fields or {})}}
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Favore già completato o stato non valido")

    debit = await db.users.update_one(
        {"user_id": payer_id, "granelli": {"$gte": favor.granelli_cost}},
        {"$inc": {"granelli": -favor.granelli_cost, "total_favors_received": 1}}
    )
    if debit.modified_count == 0:
        await db.favors.update_one(
            {"favor_id": favor.favor_id},
            {"$set": {"status": "accepted"}, "$unset": {"completed_at": ""}}
        )
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti per completare il favore")

    await db.users.update_one(
        {"user_id": helper_id},
        {"$inc": {
            "granelli": favor.granelli_cost,
            "total_favors_given": 1,
            "total_hours_helped": favor.duration_hours
        }}
    )
    return helper_id, payer_id

class QRVerifyRequest(BaseModel):
    qr_code: str

# ========================
# CHAT REPORTING SYSTEM
# ========================

class ReportCreate(BaseModel):
    favor_id: str
    reported_user_id: str
    reason: str  # "offensive", "money_request", "spam", "inappropriate", "other"
    description: Optional[str] = None

class Report(BaseModel):
    report_id: str
    favor_id: str
    reporter_id: str
    reported_user_id: str
    reason: str
    description: Optional[str] = None
    status: str = "pending"  # pending, confirmed, dismissed
    created_at: datetime

# ========================
# EXTENDED REPORTING & BLOCKING SYSTEM (Store Compliance)
# ========================

class GeneralReportCreate(BaseModel):
    """Report for favors or user profiles (not chat-specific)"""
    report_type: str  # "favor" or "user"
    target_id: str  # favor_id or user_id
    reason: str  # "offensive", "spam", "fraud", "inappropriate", "fake_profile", "other"
    description: Optional[str] = None

class BlockUserRequest(BaseModel):
    """Block a user bidirectionally"""
    user_id: str
    reason: Optional[str] = None

# Reviewer test account for store approval
REVIEWER_EMAIL = "reviewer@test.com"
REVIEWER_MODE_ENABLED = os.environ.get("REVIEWER_MODE_ENABLED", "false").lower() == "true"

# Helper function to get blocked user IDs for filtering
async def get_blocked_user_ids(user_id: str) -> set:
    """Get all user IDs that should be hidden from this user (bidirectional blocks)"""
    blocks = await db.blocked_users.find({
        "$or": [
            {"blocker_id": user_id},
            {"blocked_id": user_id}
        ]
    }).to_list(1000)
    
    blocked_ids = set()
    for block in blocks:
        if block["blocker_id"] == user_id:
            blocked_ids.add(block["blocked_id"])
        else:
            blocked_ids.add(block["blocker_id"])
    
    return blocked_ids

# ========================
# PROFILE PICTURE UPLOAD
# ========================

# Default to a directory every host lets us write to; set UPLOAD_PATH to a persistent volume if needed.
UPLOAD_PATH = Path(os.environ.get("UPLOAD_PATH") or Path(tempfile.gettempdir()) / "scambiofavori-uploads")
UPLOAD_DIR = UPLOAD_PATH / "profile_pictures"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ========================
# SUPPORTER SUBSCRIPTION SYSTEM ("Pilastro della Community")
# ========================

# Subscription Plan - Fixed at 1€/month
SUPPORTER_PLAN = {
    "id": "supporter_monthly",
    "name": "Pilastro della Community",
    "amount": 1.00,  # 1€ - MUST be float for Stripe
    "currency": "eur",
    "interval": "month"
}

class SubscriptionCheckoutRequest(BaseModel):
    origin_url: str

class SubscriptionStatusResponse(BaseModel):
    is_supporter: bool
    subscription_status: Optional[str] = None
    supporter_since: Optional[datetime] = None
    subscription_id: Optional[str] = None

class DeleteAccountRequest(BaseModel):
    confirm_email: str
    reason: Optional[str] = None

# ========================
# SKILLS & NOTIFICATIONS
# ========================

class SkillsUpdate(BaseModel):
    skills: List[str]

class NameUpdate(BaseModel):
    name: str

class Notification(BaseModel):
    notification_id: str
    user_id: str
    type: str  # "skill_match", "favor_update", "system"
    title: str
    message: str
    favor_id: Optional[str] = None
    read: bool = False
    created_at: datetime

# ========================
# PUSH NOTIFICATIONS
# ========================

class PushTokenRequest(BaseModel):
    push_token: str

class NotificationPreferences(BaseModel):
    favor_accepted: bool = True
    favor_completed: bool = True
    new_message: bool = True
    new_review: bool = True
    skill_match: bool = True

async def send_push_notification(user_id: str, title: str, body: str, data: dict = None):
    """Send push notification via Expo Push API, respecting user preferences"""
    user_doc = await db.users.find_one(
        {"user_id": user_id, "push_token": {"$exists": True, "$ne": None}},
        {"_id": 0, "push_token": 1, "notifications_enabled": 1, "notification_preferences": 1}
    )
    
    if not user_doc or not user_doc.get("push_token"):
        return False
    
    if user_doc.get("notifications_enabled") is False:
        return False
    
    # Check specific notification type preference
    notif_type = (data or {}).get("type", "")
    prefs = user_doc.get("notification_preferences", {})
    pref_map = {
        "favor_accepted": "favor_accepted",
        "favor_completed": "favor_completed",
        "new_message": "new_message",
        "review_received": "new_review",
        "skill_match": "skill_match",
    }
    pref_key = pref_map.get(notif_type)
    if pref_key and prefs.get(pref_key) is False:
        logger.info(f"Push skipped for {user_id}: preference '{pref_key}' is disabled")
        return False
    
    push_token = user_doc["push_token"]
    
    message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=message,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            result = response.json()
            if response.status_code == 200:
                logger.info(f"Push notification sent to {user_id}: {title}")
                return True
            else:
                logger.error(f"Push notification failed for {user_id}: {result}")
                return False
    except Exception as e:
        logger.error(f"Push notification error for {user_id}: {str(e)}")
        return False

async def send_push_to_multiple(user_ids: list, title: str, body: str, data: dict = None):
    """Send push notification to multiple users"""
    tasks = [send_push_notification(uid, title, body, data) for uid in user_ids]
    await asyncio.gather(*tasks, return_exceptions=True)

async def create_skill_match_notifications(favor_doc: dict):
    """Create notifications for users whose skills match the favor's category"""
    # Find users with matching skills who are not the favor creator
    matching_users = await db.users.find({
        "skills": favor_doc["category"],
        "user_id": {"$ne": favor_doc["creator_id"]},
        "notifications_enabled": {"$ne": False}
    }, {"_id": 0, "user_id": 1}).to_list(100)
    
    notifications = []
    for user in matching_users:
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "type": "skill_match",
            "title": "Nuovo favore per te!",
            "message": f"C'è una nuova richiesta di '{favor_doc['title']}' nella categoria {favor_doc['category']}",
            "favor_id": favor_doc["favor_id"],
            "read": False,
            "created_at": datetime.now(timezone.utc)
        }
        notifications.append(notification)
    
    if notifications:
        await db.notifications.insert_many(notifications)
        # Send push notifications for skill matches
        for notif in notifications:
            await send_push_notification(
                notif["user_id"],
                "Nuovo favore per te!",
                notif["message"],
                {"favor_id": notif["favor_id"], "type": "skill_match"}
            )
    
    return len(notifications)

from fastapi.responses import FileResponse

# Mount static files for uploads
from fastapi.staticfiles import StaticFiles
UPLOAD_PATH.mkdir(parents=True, exist_ok=True)

# CORS middleware — allow_origins="*" non compatibile con allow_credentials=True (RFC 6454)
_CORS_ORIGINS_ENV = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _CORS_ORIGINS_ENV.split(",") if o.strip()] or [
    "http://localhost:8081",
    "http://localhost:19006",
    "exp://localhost:8081",
]
