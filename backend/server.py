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
# CONSTANTS
# ========================

WELCOME_CREDITS = 10  # Credito di Benvenuto
REFERRAL_BONUS = 3    # Bonus referral etico
CREDITS_PER_HOUR = 1  # 1 ora = 1 credito

# Badge definitions
BADGES = {
    "cuore_oro": {
        "id": "cuore_oro",
        "name": "Cuore d'Oro",
        "description": "Hai donato almeno 10 crediti al Fondo Solidarietà",
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
    }
}

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
    credits: int = WELCOME_CREDITS
    total_favors_given: int = 0
    total_favors_received: int = 0
    micro_favors_completed: int = 0
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
    is_vulnerable: bool = False  # Utente fragile/anziano
    identity_verified: bool = False
    community_score: int = 0  # Barra di crescita
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

class FavorCreate(BaseModel):
    type: str  # "offer" or "request"
    title: str
    description: str
    category: str
    duration_hours: float = 1.0  # Parità di valore: 1 ora = 1 credito
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    is_micro: bool = False  # Micro-favore

class Favor(BaseModel):
    favor_id: str
    creator_id: str
    creator_name: str
    type: str
    title: str
    description: str
    category: str
    duration_hours: float
    credits_cost: int  # Calcolato da duration_hours
    status: str = "active"
    accepted_by: Optional[str] = None
    accepted_by_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    distance_km: Optional[float] = None
    is_micro: bool = False
    qr_code: Optional[str] = None  # Per check-in
    checkin_completed: bool = False
    created_at: datetime
    completed_at: Optional[datetime] = None

class FavorAccept(BaseModel):
    favor_id: str

class FavorComplete(BaseModel):
    favor_id: str
    qr_code: Optional[str] = None  # Per validazione check-in

class ReviewCreate(BaseModel):
    favor_id: str
    rating: int  # 1-5 efficienza
    kindness_rating: int = 5  # 1-5 gentilezza
    impact_rating: int = 5  # 1-5 impatto sociale
    comment: Optional[str] = None

class Review(BaseModel):
    review_id: str
    favor_id: str
    reviewer_id: str
    reviewer_name: str
    reviewed_id: str
    rating: int
    kindness_rating: int
    impact_rating: int
    comment: Optional[str] = None
    created_at: datetime

class DonationCreate(BaseModel):
    amount: int
    recipient_id: Optional[str] = None  # None = Fondo Solidarietà generale
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

class AuthResponse(BaseModel):
    user: User
    token: str

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
    """Get current user from session token (cookie) or Authorization header"""
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
    
    return User(**user_doc)

# ========================
# UTILITY FUNCTIONS
# ========================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two points using Haversine formula"""
    R = 6371
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

async def check_and_award_badges(user_id: str):
    """Check if user earned new badges"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    
    current_badges = user_doc.get("badges", [])
    new_badges = []
    
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
        
        if earned:
            new_badges.append(badge_id)
    
    if new_badges:
        await db.users.update_one(
            {"user_id": user_id},
            {"$push": {"badges": {"$each": new_badges}}}
        )

async def update_community_score(user_id: str):
    """Update user's community score (barra di crescita)"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    
    score = 0
    score += user_doc.get("total_favors_given", 0) * 10
    score += user_doc.get("total_favors_received", 0) * 5
    score += user_doc.get("total_donations", 0) * 15
    score += user_doc.get("successful_referrals", 0) * 20
    score += len(user_doc.get("badges", [])) * 25
    score += int(user_doc.get("average_rating", 0) * 10)
    score += int(user_doc.get("average_kindness", 0) * 10)
    score += int(user_doc.get("average_impact", 0) * 10)
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"community_score": score}}
    )

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(user_data: UserCreate):
    """Register a new user with email/password"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = hash_password(user_data.password)
    referral_code = generate_referral_code()
    
    # Check referral
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
        "credits": WELCOME_CREDITS,
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
        "is_vulnerable": False,
        "identity_verified": False,
        "community_score": 0,
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
    """Exchange session_id from Google OAuth for session token"""
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
            "credits": WELCOME_CREDITS,
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
            "is_vulnerable": False,
            "identity_verified": True,
            "community_score": 0,
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
# CATEGORIES ENDPOINT
# ========================

@api_router.get("/categories")
async def get_categories():
    """Get all favor categories"""
    return FAVOR_CATEGORIES

# ========================
# BADGES ENDPOINT
# ========================

@api_router.get("/badges")
async def get_all_badges():
    """Get all available badges"""
    return list(BADGES.values())

@api_router.get("/badges/my")
async def get_my_badges(current_user: User = Depends(get_current_user)):
    """Get current user's earned badges"""
    earned = []
    for badge_id in current_user.badges:
        if badge_id in BADGES:
            badge = BADGES[badge_id].copy()
            earned.append(badge)
    return earned

# ========================
# FAVORS ENDPOINTS
# ========================

@api_router.post("/favors", response_model=Favor)
async def create_favor(favor_data: FavorCreate, current_user: User = Depends(get_current_user)):
    """Create a new favor (offer or request)"""
    if favor_data.type not in ["offer", "request"]:
        raise HTTPException(status_code=400, detail="Tipo deve essere 'offer' o 'request'")
    
    # Calculate credits based on duration (1 hour = 1 credit)
    credits_cost = max(1, int(favor_data.duration_hours * CREDITS_PER_HOUR))
    
    # Check if category is micro
    category_info = next((c for c in FAVOR_CATEGORIES if c["name"] == favor_data.category), None)
    is_micro = favor_data.is_micro or (category_info and category_info.get("is_micro", False))
    
    # Micro favors have lower credit cost
    if is_micro:
        credits_cost = 1
    
    if favor_data.type == "request" and current_user.credits < credits_cost:
        raise HTTPException(status_code=400, detail="Crediti insufficienti")
    
    favor_id = f"favor_{uuid.uuid4().hex[:12]}"
    qr_code = generate_qr_code()
    
    favor_doc = {
        "favor_id": favor_id,
        "creator_id": current_user.user_id,
        "creator_name": current_user.name,
        "type": favor_data.type,
        "title": favor_data.title,
        "description": favor_data.description,
        "category": favor_data.category,
        "duration_hours": favor_data.duration_hours,
        "credits_cost": credits_cost,
        "status": "active",
        "accepted_by": None,
        "accepted_by_name": None,
        "latitude": favor_data.latitude,
        "longitude": favor_data.longitude,
        "address": favor_data.address,
        "is_micro": is_micro,
        "qr_code": qr_code,
        "checkin_completed": False,
        "created_at": datetime.now(timezone.utc),
        "completed_at": None
    }
    
    await db.favors.insert_one(favor_doc)
    return Favor(**favor_doc)

@api_router.get("/favors", response_model=List[Favor])
async def get_favors(
    type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "active",
    is_micro: Optional[bool] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: Optional[float] = None
):
    """Get all favors with optional filters"""
    query = {"status": status}
    
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if is_micro is not None:
        query["is_micro"] = is_micro
    
    favors_cursor = db.favors.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    favors = await favors_cursor.to_list(100)
    
    result = []
    for favor in favors:
        favor_obj = Favor(**favor)
        
        if latitude and longitude and favor_obj.latitude and favor_obj.longitude:
            distance = calculate_distance(latitude, longitude, favor_obj.latitude, favor_obj.longitude)
            favor_obj.distance_km = round(distance, 2)
            
            if max_distance_km and distance > max_distance_km:
                continue
        
        result.append(favor_obj)
    
    if latitude and longitude:
        result.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return result

@api_router.get("/favors/nearby")
async def get_nearby_favors(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    type: Optional[str] = None
):
    """Get favors in neighborhood (filtri di prossimità)"""
    query = {"status": "active"}
    if type:
        query["type"] = type
    
    favors_cursor = db.favors.find(query, {"_id": 0})
    favors = await favors_cursor.to_list(500)
    
    nearby = []
    for favor in favors:
        if favor.get("latitude") and favor.get("longitude"):
            distance = calculate_distance(latitude, longitude, favor["latitude"], favor["longitude"])
            if distance <= radius_km:
                favor["distance_km"] = round(distance, 2)
                nearby.append(Favor(**favor))
    
    nearby.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    return nearby

@api_router.get("/favors/suggestions")
async def get_favor_suggestions(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    current_user: User = Depends(get_current_user)
):
    """Get personalized favor suggestions (notifiche predittive)"""
    suggestions = []
    
    # Find nearby favors that match user's history
    query = {"status": "active", "creator_id": {"$ne": current_user.user_id}}
    favors_cursor = db.favors.find(query, {"_id": 0}).limit(50)
    favors = await favors_cursor.to_list(50)
    
    # Get user's completed favors to understand preferences
    user_favors = await db.favors.find(
        {"$or": [{"creator_id": current_user.user_id}, {"accepted_by": current_user.user_id}]},
        {"_id": 0, "category": 1}
    ).to_list(100)
    
    preferred_categories = [f["category"] for f in user_favors]
    
    for favor in favors:
        score = 0
        
        # Boost score for preferred categories
        if favor.get("category") in preferred_categories:
            score += 20
        
        # Boost score for nearby favors
        if latitude and longitude and favor.get("latitude") and favor.get("longitude"):
            distance = calculate_distance(latitude, longitude, favor["latitude"], favor["longitude"])
            if distance <= 2:
                score += 30
            elif distance <= 5:
                score += 20
            elif distance <= 10:
                score += 10
            favor["distance_km"] = round(distance, 2)
        
        # Boost micro favors for quick engagement
        if favor.get("is_micro"):
            score += 10
        
        favor["suggestion_score"] = score
        suggestions.append(favor)
    
    # Sort by suggestion score
    suggestions.sort(key=lambda x: x.get("suggestion_score", 0), reverse=True)
    
    return [Favor(**s) for s in suggestions[:10]]

@api_router.get("/favors/my", response_model=List[Favor])
async def get_my_favors(current_user: User = Depends(get_current_user)):
    """Get current user's favors"""
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
async def get_favor(favor_id: str):
    """Get a specific favor"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    return Favor(**favor_doc)

@api_router.get("/favors/{favor_id}/qr")
async def get_favor_qr(favor_id: str, current_user: User = Depends(get_current_user)):
    """Get QR code for favor check-in"""
    favor_doc = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    # Only involved users can see QR
    if favor_doc["creator_id"] != current_user.user_id and favor_doc.get("accepted_by") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    return {"qr_code": favor_doc.get("qr_code")}

@api_router.post("/favors/accept", response_model=Favor)
async def accept_favor(data: FavorAccept, current_user: User = Depends(get_current_user)):
    """Accept a favor"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "active":
        raise HTTPException(status_code=400, detail="Il favore non è più disponibile")
    
    if favor.creator_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Non puoi accettare il tuo stesso favore")
    
    if favor.type == "offer" and current_user.credits < favor.credits_cost:
        raise HTTPException(status_code=400, detail="Crediti insufficienti per accettare questo favore")
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {
            "status": "accepted",
            "accepted_by": current_user.user_id,
            "accepted_by_name": current_user.name
        }}
    )
    
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    return Favor(**favor_doc)

@api_router.post("/favors/checkin")
async def checkin_favor(data: FavorComplete, current_user: User = Depends(get_current_user)):
    """Validate check-in with QR code"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    if favor_doc.get("qr_code") != data.qr_code:
        raise HTTPException(status_code=400, detail="QR code non valido")
    
    # Only the other party can check-in
    if favor_doc["creator_id"] == current_user.user_id:
        # Creator is checking in, must be the accepter's QR
        pass
    elif favor_doc.get("accepted_by") == current_user.user_id:
        pass
    else:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {"checkin_completed": True}}
    )
    
    return {"message": "Check-in completato", "checkin_completed": True}

@api_router.post("/favors/complete", response_model=Favor)
async def complete_favor(data: FavorComplete, current_user: User = Depends(get_current_user)):
    """Mark a favor as completed"""
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "accepted":
        raise HTTPException(status_code=400, detail="Il favore deve essere in stato 'accepted'")
    
    if favor.creator_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo il creatore può completare il favore")
    
    # Transfer credits
    if favor.type == "offer":
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {
                "credits": favor.credits_cost,
                "total_favors_given": 1,
                "total_hours_helped": favor.duration_hours
            }}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {"credits": -favor.credits_cost, "total_favors_received": 1}}
        )
    else:
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {"credits": -favor.credits_cost, "total_favors_received": 1}}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {
                "credits": favor.credits_cost,
                "total_favors_given": 1,
                "total_hours_helped": favor.duration_hours
            }}
        )
    
    # Update micro favors count
    if favor.is_micro:
        helper_id = favor.accepted_by if favor.type == "request" else favor.creator_id
        await db.users.update_one(
            {"user_id": helper_id},
            {"$inc": {"micro_favors_completed": 1}}
        )
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc)
        }}
    )
    
    # Handle referral bonus (first favor completed)
    for user_id in [favor.creator_id, favor.accepted_by]:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user and user.get("referred_by"):
            total_favors = user.get("total_favors_given", 0) + user.get("total_favors_received", 0)
            if total_favors == 1:  # First favor just completed
                # Give bonus to referrer
                await db.users.update_one(
                    {"user_id": user["referred_by"]},
                    {"$inc": {"credits": REFERRAL_BONUS, "successful_referrals": 1}}
                )
                await check_and_award_badges(user["referred_by"])
                await update_community_score(user["referred_by"])
    
    # Check badges and update scores
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
    
    favor = Favor(**favor_doc)
    
    if favor.creator_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Solo il creatore può cancellare il favore")
    
    if favor.status == "completed":
        raise HTTPException(status_code=400, detail="Non puoi cancellare un favore completato")
    
    await db.favors.update_one(
        {"favor_id": favor_id},
        {"$set": {"status": "cancelled"}}
    )
    
    return {"message": "Favore cancellato"}

# ========================
# REVIEWS ENDPOINTS
# ========================

@api_router.post("/reviews", response_model=Review)
async def create_review(review_data: ReviewCreate, current_user: User = Depends(get_current_user)):
    """Create a review with qualitative feedback"""
    favor_doc = await db.favors.find_one({"favor_id": review_data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "completed":
        raise HTTPException(status_code=400, detail="Puoi recensire solo favori completati")
    
    if current_user.user_id == favor.creator_id:
        reviewed_id = favor.accepted_by
    elif current_user.user_id == favor.accepted_by:
        reviewed_id = favor.creator_id
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
        "comment": review_data.comment,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.reviews.insert_one(review_doc)
    
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

@api_router.get("/reviews/user/{user_id}", response_model=List[Review])
async def get_user_reviews(user_id: str):
    """Get all reviews for a user"""
    reviews_cursor = db.reviews.find({"reviewed_id": user_id}, {"_id": 0}).sort("created_at", -1)
    reviews = await reviews_cursor.to_list(100)
    return [Review(**review) for review in reviews]

@api_router.get("/reviews/favor/{favor_id}", response_model=List[Review])
async def get_favor_reviews(favor_id: str):
    """Get all reviews for a favor"""
    reviews_cursor = db.reviews.find({"favor_id": favor_id}, {"_id": 0})
    reviews = await reviews_cursor.to_list(10)
    return [Review(**review) for review in reviews]

# ========================
# DONATIONS (FONDO SOLIDARIETÀ)
# ========================

@api_router.post("/donations", response_model=Donation)
async def create_donation(donation_data: DonationCreate, current_user: User = Depends(get_current_user)):
    """Donate credits to solidarity fund or specific user"""
    if donation_data.amount < 1:
        raise HTTPException(status_code=400, detail="L'importo deve essere almeno 1 credito")
    
    if current_user.credits < donation_data.amount:
        raise HTTPException(status_code=400, detail="Crediti insufficienti")
    
    recipient_name = None
    is_solidarity_fund = True
    
    if donation_data.recipient_id:
        # Direct donation to a user
        recipient = await db.users.find_one({"user_id": donation_data.recipient_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Destinatario non trovato")
        recipient_name = recipient["name"]
        is_solidarity_fund = False
        
        # Transfer credits to recipient
        await db.users.update_one(
            {"user_id": donation_data.recipient_id},
            {"$inc": {"credits": donation_data.amount}}
        )
    
    # Deduct from donor
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$inc": {"credits": -donation_data.amount, "total_donations": donation_data.amount}}
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
    return {"solidarity_fund_total": total}

@api_router.get("/donations/my")
async def get_my_donations(current_user: User = Depends(get_current_user)):
    """Get current user's donations"""
    donations_cursor = db.donations.find({"donor_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1)
    donations = await donations_cursor.to_list(100)
    return [Donation(**d) for d in donations]

@api_router.post("/donations/claim")
async def claim_solidarity_credits(current_user: User = Depends(get_current_user)):
    """Claim credits from solidarity fund (only for vulnerable users)"""
    if not current_user.is_vulnerable:
        raise HTTPException(status_code=403, detail="Solo utenti fragili possono richiedere crediti dal fondo")
    
    # Check fund balance
    pipeline = [
        {"$match": {"is_solidarity_fund": True}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.donations.aggregate(pipeline).to_list(1)
    fund_total = result[0]["total"] if result else 0
    
    # Calculate already claimed
    claimed_pipeline = [
        {"$match": {"recipient_id": current_user.user_id, "is_solidarity_fund": True}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    claimed_result = await db.donations.aggregate(claimed_pipeline).to_list(1)
    already_claimed = claimed_result[0]["total"] if claimed_result else 0
    
    # Limit: max 5 credits per user from fund
    max_claim = min(5 - already_claimed, fund_total)
    if max_claim <= 0:
        raise HTTPException(status_code=400, detail="Hai già ricevuto il massimo dal fondo o il fondo è vuoto")
    
    claim_amount = min(3, max_claim)  # Claim 3 at a time
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$inc": {"credits": claim_amount}}
    )
    
    # Record the claim
    await db.donations.insert_one({
        "donation_id": f"claim_{uuid.uuid4().hex[:12]}",
        "donor_id": "solidarity_fund",
        "donor_name": "Fondo Solidarietà",
        "recipient_id": current_user.user_id,
        "recipient_name": current_user.name,
        "amount": -claim_amount,  # Negative to track fund usage
        "message": "Prelievo dal Fondo Solidarietà",
        "is_solidarity_fund": True,
        "created_at": datetime.now(timezone.utc)
    })
    
    return {"message": f"Hai ricevuto {claim_amount} crediti dal Fondo Solidarietà", "amount": claim_amount}

# ========================
# USER PROFILE ENDPOINTS
# ========================

@api_router.get("/users/{user_id}", response_model=User)
async def get_user_profile(user_id: str):
    """Get a user's public profile"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return User(**user_doc)

@api_router.patch("/users/me")
async def update_my_profile(
    is_vulnerable: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    """Update current user's profile"""
    updates = {}
    if is_vulnerable is not None:
        updates["is_vulnerable"] = is_vulnerable
    
    if updates:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": updates}
        )
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0})
    return User(**user_doc)

@api_router.get("/users/vulnerable/list")
async def get_vulnerable_users():
    """Get list of vulnerable users who might need help"""
    users_cursor = db.users.find(
        {"is_vulnerable": True},
        {"_id": 0, "user_id": 1, "name": 1, "credits": 1, "community_score": 1}
    ).limit(50)
    users = await users_cursor.to_list(50)
    return users

@api_router.get("/leaderboard")
async def get_leaderboard():
    """Get community leaderboard by community score"""
    users_cursor = db.users.find(
        {},
        {"_id": 0, "user_id": 1, "name": 1, "community_score": 1, "badges": 1, "total_favors_given": 1}
    ).sort("community_score", -1).limit(20)
    users = await users_cursor.to_list(20)
    return users

# ========================
# REFERRAL ENDPOINT
# ========================

@api_router.get("/referral/code")
async def get_my_referral_code(current_user: User = Depends(get_current_user)):
    """Get current user's referral code"""
    return {
        "referral_code": current_user.referral_code,
        "successful_referrals": current_user.successful_referrals,
        "bonus_per_referral": REFERRAL_BONUS
    }

# ========================
# HEALTH CHECK
# ========================

@api_router.get("/")
async def root():
    return {"message": "Scambio di Favori API v2.0", "status": "running"}

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
