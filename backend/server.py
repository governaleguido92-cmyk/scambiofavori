from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import math
import secrets
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'scambio-favori-secret-key-2025-extended')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

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
    referral_code: str
    referred_by: Optional[str] = None
    successful_referrals: int = 0
    badges: List[str] = []
    title: str = "Nuovo Vicino"
    is_vulnerable: bool = False
    identity_verified: bool = False
    community_score: int = 0
    social_impact_score: int = 0  # New: Social Impact Bar
    can_access_solidarity_fund: bool = False
    # Privacy: approximate location for public display
    approximate_latitude: Optional[float] = None
    approximate_longitude: Optional[float] = None
    neighborhood: Optional[str] = None
    created_at: datetime

class FavorCategory(BaseModel):
    name: str
    icon: str
    is_micro: bool = False

FAVOR_CATEGORIES = [
    {"name": "Trasporto", "icon": "car", "is_micro": False},
    {"name": "Spesa", "icon": "cart", "is_micro": False},
    {"name": "Tecnologia", "icon": "laptop", "is_micro": False},
    {"name": "Pulizie", "icon": "water", "is_micro": False},
    {"name": "Compagnia", "icon": "people", "is_micro": False},
    {"name": "Cucina", "icon": "restaurant", "is_micro": False},
    {"name": "Giardinaggio", "icon": "leaf", "is_micro": False},
    {"name": "Consiglio", "icon": "bulb", "is_micro": True},
    {"name": "Informazione", "icon": "information-circle", "is_micro": True},
    {"name": "Aiuto Rapido", "icon": "flash", "is_micro": True},
    {"name": "Altro", "icon": "ellipsis-horizontal", "is_micro": False},
]

# Object categories for Oggettoteca
OBJECT_CATEGORIES = [
    {"name": "Utensili", "icon": "hammer"},
    {"name": "Cucina", "icon": "restaurant"},
    {"name": "Giardino", "icon": "leaf"},
    {"name": "Sport", "icon": "football"},
    {"name": "Elettronica", "icon": "laptop"},
    {"name": "Bambini", "icon": "happy"},
    {"name": "Fai da te", "icon": "construct"},
    {"name": "Altro", "icon": "cube"},
]

class FavorCreate(BaseModel):
    type: str  # "offer" or "request"
    title: str
    description: str
    category: str
    duration_hours: float = 1.0
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
    type: str
    title: str
    description: str
    category: str
    duration_hours: float
    granelli_cost: int  # Renamed from credits_cost
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
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
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
    
    granelli_cost = max(1, int(favor_data.duration_hours * GRANELLI_PER_HOUR))
    
    category_info = next((c for c in FAVOR_CATEGORIES if c["name"] == favor_data.category), None)
    is_micro = favor_data.is_micro or (category_info and category_info.get("is_micro", False))
    
    if is_micro:
        granelli_cost = 1
    
    if favor_data.type == "request" and current_user.granelli < granelli_cost:
        raise HTTPException(status_code=400, detail=f"{CURRENCY_NAME} insufficienti")
    
    favor_id = f"favor_{uuid.uuid4().hex[:12]}"
    qr_code = generate_qr_code()
    
    # Privacy: create approximate location
    approx_lat, approx_lon = None, None
    if favor_data.latitude and favor_data.longitude:
        approx_lat, approx_lon = approximate_location(favor_data.latitude, favor_data.longitude)
    
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
        "qr_code": qr_code,
        "checkin_completed": False,
        "created_at": datetime.now(timezone.utc),
        "completed_at": None
    }
    
    await db.favors.insert_one(favor_doc)
    
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
    
    result = []
    for favor in favors:
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
