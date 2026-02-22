from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
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

# Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Stripe Config
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
if not STRIPE_API_KEY:
    raise ValueError("STRIPE_API_KEY environment variable is required")

# OAuth Config
OAUTH_SESSION_URL = os.environ.get('OAUTH_SESSION_URL', 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data')

# Create the main app
app = FastAPI()

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    referral_code: Optional[str] = None

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
    neighborhood: Optional[str] = None
    created_at: Optional[datetime] = None

class FavorCategory(BaseModel):
    name: str
    icon: str
    is_micro: bool = False

FAVOR_CATEGORIES = [
    {"name": "Trasporto", "icon": "heart-circle", "is_micro": False},
    {"name": "Spesa", "icon": "heart", "is_micro": False},
    {"name": "Tecnologia", "icon": "heart-half", "is_micro": False},
    {"name": "Pulizie", "icon": "home", "is_micro": False},
    {"name": "Compagnia", "icon": "people", "is_micro": False},
    {"name": "Cucina", "icon": "heart-circle-outline", "is_micro": False},
    {"name": "Giardinaggio", "icon": "leaf", "is_micro": False},
    {"name": "Consiglio", "icon": "chatbubble-ellipses", "is_micro": True},
    {"name": "Informazione", "icon": "hand-left", "is_micro": True},
    {"name": "Aiuto Rapido", "icon": "heart-sharp", "is_micro": True},
    {"name": "Altro", "icon": "heart-outline", "is_micro": False},
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
    is_micro: bool = False
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
    is_micro: bool = False
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

def generate_referral_code() -> str:
    return secrets.token_urlsafe(6).upper()[:8]

def generate_qr_code() -> str:
    return secrets.token_urlsafe(16)

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

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = hash_password(user_data.password)
    referral_code = generate_referral_code()
    
    referred_by = None
    if user_data.referral_code:
        referrer = await db.users.find_one({"referral_code": user_data.referral_code})
        if referrer:
            referred_by = referrer["user_id"]
    
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
        "community_score": 0,
        "social_impact_score": 0,
        "can_access_solidarity_fund": False,
        # Social Debt Limit fields
        "reliability_score": 5.0,
        "debt_start_date": None,
        "last_activity_date": datetime.now(timezone.utc),
        "in_debt_recovery": False,
        # Privacy
        "approximate_latitude": None,
        "approximate_longitude": None,
        "neighborhood": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    user_doc.pop("password_hash", None)
    
    return AuthResponse(user=User(**user_doc), token=token)

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(credentials: UserLogin, response: Response):
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
            "neighborhood": None,
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

class AppleAuthRequest(BaseModel):
    identity_token: str
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None

@api_router.post("/auth/apple")
async def apple_auth(auth_data: AppleAuthRequest, response: Response):
    """Authenticate with Apple Sign In"""
    import jwt as pyjwt
    
    try:
        # Decode Apple's identity token (without verification for now - in production, verify with Apple's public key)
        # The token is a JWT signed by Apple
        decoded = pyjwt.decode(auth_data.identity_token, options={"verify_signature": False})
        
        apple_user_id = decoded.get("sub")  # Apple's unique user identifier
        email = auth_data.email or decoded.get("email")
        
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
# FAVORS ENDPOINTS
# ========================

@api_router.post("/favors", response_model=Favor)
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
    
    category_info = next((c for c in FAVOR_CATEGORIES if c["name"] == favor_data.category), None)
    is_micro = favor_data.is_micro or (category_info and category_info.get("is_micro", False))
    
    if is_micro:
        granelli_cost = 1
    
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
        "is_micro": is_micro,
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

@api_router.get("/favors", response_model=List[Favor])
async def get_favors(
    type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "active",
    is_micro: Optional[bool] = None,
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
    if is_micro is not None:
        query["is_micro"] = is_micro
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

@api_router.get("/favors/emergencies")
async def get_emergencies(
    latitude: float,
    longitude: float,
    current_user: User = Depends(get_current_user)
):
    """Get nearby emergency requests (for notifications)"""
    query = {"status": "active", "is_emergency": True}
    
    favors_cursor = db.favors.find(query, {"_id": 0, "exact_latitude": 0, "exact_longitude": 0})
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

@api_router.get("/favors/my", response_model=List[Favor])
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

@api_router.get("/favors/{favor_id}", response_model=Favor)
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

@api_router.post("/favors/accept", response_model=Favor)
async def accept_favor(data: FavorAccept, current_user: User = Depends(get_current_user)):
    """Accept a favor (reveals exact location)"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "active":
        raise HTTPException(status_code=400, detail="Il favore non è più disponibile")
    
    if favor.creator_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi accettare il tuo stesso favore")
    
    if favor.type == "offer" and current_user.granelli < favor.granelli_cost:
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti per accettare questo favore")
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {
            "status": "accepted",
            "accepted_by": current_user.user_id,
            "accepted_by_name": current_user.name
        }}
    )
    
    # Return with exact location now revealed
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    return Favor(**favor_doc)

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

@api_router.post("/favors/complete", response_model=Favor)
async def complete_favor(data: FavorComplete, current_user: User = Depends(get_current_user)):
    """Complete a favor and transfer Soli"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accepted'")
    
    if favor.creator_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo il creatore può completare il favore")
    
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
    
    # Transfer Soli
    if favor.type == "offer":
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {
                "granelli": favor.granelli_cost,
                "total_favors_given": 1,
                "total_hours_helped": favor.duration_hours
            }}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {"granelli": -favor.granelli_cost, "total_favors_received": 1}}
        )
    else:
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {"granelli": -favor.granelli_cost, "total_favors_received": 1}}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {
                "granelli": favor.granelli_cost,
                "total_favors_given": 1,
                "total_hours_helped": favor.duration_hours
            }}
        )
    
    # Update micro favors and emergency counts
    if favor.is_micro:
        helper_id = favor.accepted_by if favor.type == "request" else favor.creator_id
        await db.users.update_one(
            {"user_id": helper_id},
            {"$inc": {"micro_favors_completed": 1}}
        )
    
    if favor.is_emergency:
        helper_id = favor.accepted_by if favor.type == "request" else favor.creator_id
        await db.users.update_one(
            {"user_id": helper_id},
            {"$inc": {"emergencies_helped": 1}}
        )
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc)
        }}
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
    
    # Prepare response (remove _id added by MongoDB)
    response_dict = {k: v for k, v in message_doc.items() if k != '_id'}
    response_dict["created_at"] = response_dict["created_at"].isoformat()
    
    # Add warnings to response if any
    if response_warnings:
        response_dict["warnings"] = response_warnings
    
    return response_dict

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
REVIEWER_MODE_ENABLED = True

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
# PROFILE COMPLETION TRACKING
# ========================

@api_router.get("/users/me/profile-completion")
async def get_profile_completion(current_user: User = Depends(get_current_user)):
    """Get profile completion percentage and missing items"""
    
    completion_items = []
    total_items = 4
    completed_items = 0
    
    # 1. Name (25%)
    has_name = bool(current_user.name and len(current_user.name) > 1)
    completion_items.append({
        "id": "name",
        "label": "Nome profilo",
        "completed": has_name,
        "points": 25
    })
    if has_name:
        completed_items += 1
    
    # 2. Profile photo (25%) - Check if user has avatar_url
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    has_photo = bool(user_doc.get("avatar_url"))
    completion_items.append({
        "id": "photo",
        "label": "Foto profilo",
        "completed": has_photo,
        "points": 25
    })
    if has_photo:
        completed_items += 1
    
    # 3. Skills/Competenze (25%)
    has_skills = bool(current_user.skills and len(current_user.skills) > 0)
    completion_items.append({
        "id": "skills",
        "label": "Competenze",
        "completed": has_skills,
        "points": 25
    })
    if has_skills:
        completed_items += 1
    
    # 4. First completed favor (25%)
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
    
    percentage = (completed_items / total_items) * 100
    
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

# ========================
# PROFILE PICTURE UPLOAD
# ========================

UPLOAD_DIR = Path("/app/uploads/profile_pictures")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@api_router.post("/users/me/picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload profile picture"""
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo file non supportato. Usa JPG, PNG o WebP.")
    
    # Read file content
    content = await file.read()
    
    # Check file size (max 5MB)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File troppo grande. Massimo 5MB.")
    
    # Generate unique filename
    extension = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'jpg'
    filename = f"{current_user.user_id}_{uuid.uuid4().hex[:8]}.{extension}"
    filepath = UPLOAD_DIR / filename
    
    # Save file
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Generate URL (relative path that will be served by the app)
    picture_url = f"/uploads/profile_pictures/{filename}"
    
    # Update user in database
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"picture": picture_url, "avatar_url": picture_url}}
    )
    
    return {"picture": picture_url, "message": "Foto profilo aggiornata!"}

# ========================
# REVIEWER/DEBUG MODE (Store Approval)
# ========================

@api_router.post("/debug/mock-qr-scan")
async def mock_qr_scan(favor_id: str, current_user: User = Depends(get_current_user)):
    """Mock QR scan for reviewer accounts - simulates completing a favor without actual QR"""
    
    # Only allow for reviewer account
    if current_user.email != REVIEWER_EMAIL and not REVIEWER_MODE_ENABLED:
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
    
    # Simulate QR completion
    granelli_cost = favor.get("granelli_cost", 1)
    
    # Transfer granelli
    if favor["type"] == "offer":
        giver_id = favor["creator_id"]
        receiver_id = favor["accepted_by"]
    else:
        giver_id = favor["accepted_by"]
        receiver_id = favor["creator_id"]
    
    # Update balances
    await db.users.update_one(
        {"user_id": receiver_id},
        {"$inc": {"granelli": granelli_cost}}
    )
    
    # Update favor status
    await db.favors.update_one(
        {"favor_id": favor_id},
        {
            "$set": {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
                "completion_method": "mock_qr_debug"
            }
        }
    )
    
    # Update social impact scores
    await db.users.update_one(
        {"user_id": giver_id},
        {"$inc": {"social_impact_score": 20, "favors_given": 1}}
    )
    await db.users.update_one(
        {"user_id": receiver_id},
        {"$inc": {"social_impact_score": 10, "favors_received": 1}}
    )
    
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
    
    # Initialize Stripe checkout
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session with metadata
    metadata = {
        "user_id": current_user.user_id,
        "user_email": current_user.email,
        "plan_id": SUPPORTER_PLAN["id"],
        "subscription_type": "supporter_monthly"
    }
    
    checkout_request = CheckoutSessionRequest(
        amount=SUPPORTER_PLAN["amount"],
        currency=SUPPORTER_PLAN["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
    try:
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create payment transaction record
        transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
        transaction_doc = {
            "transaction_id": transaction_id,
            "session_id": session.session_id,
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
            "session_id": session.session_id
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
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update transaction record
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": status.payment_status,
                "status": status.status,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # If payment successful, update user as supporter
        if status.payment_status == "paid":
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
                "status": status.status,
                "payment_status": status.payment_status,
                "message": "Grazie! Sei ufficialmente un Sostenitore. Da oggi il tuo profilo brillerà sulla mappa!",
                "is_supporter": True
            }
        
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "message": "Pagamento in elaborazione..." if status.status != "expired" else "Sessione scaduta"
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
    
    try:
        host_url = str(request.base_url)
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        # Log the event
        logger.info(f"Stripe webhook: {webhook_response.event_type} - {webhook_response.session_id}")
        
        # Handle different event types
        if webhook_response.event_type == "checkout.session.completed":
            # Payment successful
            user_id = webhook_response.metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "is_supporter": True,
                        "subscription_status": "active",
                        "subscription_id": webhook_response.session_id,
                        "supporter_since": datetime.now(timezone.utc)
                    }}
                )
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$addToSet": {"badges": "supporter"}}
                )
                
        elif webhook_response.event_type in ["customer.subscription.deleted", "invoice.payment_failed"]:
            # Subscription cancelled or payment failed
            user_id = webhook_response.metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "is_supporter": False,
                        "subscription_status": "cancelled"
                    }}
                )
                # Remove supporter badge
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$pull": {"badges": "supporter"}}
                )
        
        # Update payment transaction
        await db.payment_transactions.update_one(
            {"session_id": webhook_response.session_id},
            {"$set": {
                "payment_status": webhook_response.payment_status,
                "event_type": webhook_response.event_type,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Stripe webhook error: {e}")
        return {"status": "error", "message": str(e)}

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

class DeleteAccountRequest(BaseModel):
    confirm_email: str
    reason: Optional[str] = None

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
    
    # 6. Elimina definitivamente l'account utente
    await db.users.delete_one({"user_id": user_id})
    
    return {
        "message": "Account eliminato con successo",
        "details": "Tutti i tuoi dati personali sono stati cancellati in conformità al GDPR"
    }

# ========================
# SKILLS & NOTIFICATIONS
# ========================

class SkillsUpdate(BaseModel):
    skills: List[str]

class Notification(BaseModel):
    notification_id: str
    user_id: str
    type: str  # "skill_match", "favor_update", "system"
    title: str
    message: str
    favor_id: Optional[str] = None
    read: bool = False
    created_at: datetime

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

@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(get_current_user)):
    """Get user's notifications"""
    notifications = await db.notifications.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return notifications

@api_router.post("/notifications/read/{notification_id}")
async def mark_notification_read(notification_id: str, current_user: User = Depends(get_current_user)):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": current_user.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notifica segnata come letta"}

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: User = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": current_user.user_id,
        "read": False
    })
    return {"unread_count": count}

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
    
    return len(notifications)

# ========================
# HEALTH CHECK
# ========================

@api_router.get("/")
async def root():
    return {
        "message": "Scambio di Favori API v3.0",
        "status": "running",
        "currency": CURRENCY_NAME,
        "features": ["Muro del Quartiere", "Oggettoteca", "Emergenze Gentilezza", "Bacheca dei Grazie"]
    }

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

# Mount static files for uploads
from fastapi.staticfiles import StaticFiles
UPLOAD_PATH = Path("/app/uploads")
UPLOAD_PATH.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_PATH)), name="uploads")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
