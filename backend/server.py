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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'scambio-favori-secret-key-2025')
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
# MODELS
# ========================

class UserBase(BaseModel):
    email: str
    name: str

class UserCreate(BaseModel):
    email: str
    name: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    credits: int = 10
    total_favors_given: int = 0
    total_favors_received: int = 0
    average_rating: float = 0.0
    created_at: datetime

class FavorCategory(BaseModel):
    name: str
    icon: str

FAVOR_CATEGORIES = [
    {"name": "Trasporto", "icon": "car"},
    {"name": "Spesa", "icon": "cart"},
    {"name": "Tecnologia", "icon": "laptop"},
    {"name": "Pulizie", "icon": "broom"},
    {"name": "Compagnia", "icon": "people"},
    {"name": "Cucina", "icon": "restaurant"},
    {"name": "Giardinaggio", "icon": "leaf"},
    {"name": "Altro", "icon": "ellipsis-horizontal"},
]

class FavorCreate(BaseModel):
    type: str  # "offer" or "request"
    title: str
    description: str
    category: str
    credits_cost: int = 1
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

class Favor(BaseModel):
    favor_id: str
    creator_id: str
    creator_name: str
    type: str  # "offer" or "request"
    title: str
    description: str
    category: str
    credits_cost: int
    status: str = "active"  # active, accepted, completed, cancelled
    accepted_by: Optional[str] = None
    accepted_by_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    distance_km: Optional[float] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

class FavorAccept(BaseModel):
    favor_id: str

class FavorComplete(BaseModel):
    favor_id: str

class ReviewCreate(BaseModel):
    favor_id: str
    rating: int  # 1-5
    comment: Optional[str] = None

class Review(BaseModel):
    review_id: str
    favor_id: str
    reviewer_id: str
    reviewer_name: str
    reviewed_id: str
    rating: int
    comment: Optional[str] = None
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

async def get_current_user(request: Request) -> User:
    """Get current user from session token (cookie) or Authorization header"""
    # Try cookie first
    session_token = request.cookies.get("session_token")
    
    # Then try Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    
    # Check if it's a JWT token (custom auth)
    user_id = decode_jwt_token(session_token)
    if user_id:
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user_doc:
            return User(**user_doc)
    
    # Check if it's a session token (Google OAuth)
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Sessione non valida")
    
    # Check expiry
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
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(user_data: UserCreate):
    """Register a new user with email/password"""
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = hash_password(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "picture": None,
        "password_hash": hashed_password,
        "credits": 10,
        "total_favors_given": 0,
        "total_favors_received": 0,
        "average_rating": 0.0,
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
    
    # Set cookie
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
    
    # Get user data from Emergent Auth
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
    
    # Check if user exists
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user_doc:
        # Update existing user
        user_id = user_doc["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
        user_doc["name"] = name
        user_doc["picture"] = picture
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "credits": 10,
            "total_favors_given": 0,
            "total_favors_received": 0,
            "average_rating": 0.0,
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
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
# FAVORS ENDPOINTS
# ========================

@api_router.post("/favors", response_model=Favor)
async def create_favor(favor_data: FavorCreate, current_user: User = Depends(get_current_user)):
    """Create a new favor (offer or request)"""
    if favor_data.type not in ["offer", "request"]:
        raise HTTPException(status_code=400, detail="Tipo deve essere 'offer' o 'request'")
    
    if favor_data.credits_cost < 1:
        raise HTTPException(status_code=400, detail="Il costo in crediti deve essere almeno 1")
    
    # If requesting a favor, check if user has enough credits
    if favor_data.type == "request" and current_user.credits < favor_data.credits_cost:
        raise HTTPException(status_code=400, detail="Crediti insufficienti")
    
    favor_id = f"favor_{uuid.uuid4().hex[:12]}"
    
    favor_doc = {
        "favor_id": favor_id,
        "creator_id": current_user.user_id,
        "creator_name": current_user.name,
        "type": favor_data.type,
        "title": favor_data.title,
        "description": favor_data.description,
        "category": favor_data.category,
        "credits_cost": favor_data.credits_cost,
        "status": "active",
        "accepted_by": None,
        "accepted_by_name": None,
        "latitude": favor_data.latitude,
        "longitude": favor_data.longitude,
        "address": favor_data.address,
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
    
    favors_cursor = db.favors.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    favors = await favors_cursor.to_list(100)
    
    result = []
    for favor in favors:
        favor_obj = Favor(**favor)
        
        # Calculate distance if user location provided
        if latitude and longitude and favor_obj.latitude and favor_obj.longitude:
            distance = calculate_distance(latitude, longitude, favor_obj.latitude, favor_obj.longitude)
            favor_obj.distance_km = round(distance, 2)
            
            # Filter by max distance if specified
            if max_distance_km and distance > max_distance_km:
                continue
        
        result.append(favor_obj)
    
    # Sort by distance if available
    if latitude and longitude:
        result.sort(key=lambda x: x.distance_km if x.distance_km else float('inf'))
    
    return result

@api_router.get("/favors/my", response_model=List[Favor])
async def get_my_favors(current_user: User = Depends(get_current_user)):
    """Get current user's favors (created or accepted)"""
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
    
    # For request type, the person accepting will do the favor and receive credits
    # For offer type, the person accepting will receive the favor and spend credits
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

@api_router.post("/favors/complete", response_model=Favor)
async def complete_favor(data: FavorComplete, current_user: User = Depends(get_current_user)):
    """Mark a favor as completed (only creator can complete)"""
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
        # Creator offered a favor, receives credits from accepter
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {"credits": favor.credits_cost, "total_favors_given": 1}}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {"credits": -favor.credits_cost, "total_favors_received": 1}}
        )
    else:
        # Creator requested a favor, pays credits to accepter
        await db.users.update_one(
            {"user_id": favor.creator_id},
            {"$inc": {"credits": -favor.credits_cost, "total_favors_received": 1}}
        )
        await db.users.update_one(
            {"user_id": favor.accepted_by},
            {"$inc": {"credits": favor.credits_cost, "total_favors_given": 1}}
        )
    
    await db.favors.update_one(
        {"favor_id": data.favor_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc)
        }}
    )
    
    favor_doc = await db.favors.find_one({"favor_id": data.favor_id}, {"_id": 0})
    return Favor(**favor_doc)

@api_router.delete("/favors/{favor_id}")
async def cancel_favor(favor_id: str, current_user: User = Depends(get_current_user)):
    """Cancel a favor (only creator can cancel, only if not completed)"""
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
    """Create a review for a completed favor"""
    favor_doc = await db.favors.find_one({"favor_id": review_data.favor_id}, {"_id": 0})
    if not favor_doc:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    
    favor = Favor(**favor_doc)
    
    if favor.status != "completed":
        raise HTTPException(status_code=400, detail="Puoi recensire solo favori completati")
    
    # Determine who can review whom
    if current_user.user_id == favor.creator_id:
        reviewed_id = favor.accepted_by
    elif current_user.user_id == favor.accepted_by:
        reviewed_id = favor.creator_id
    else:
        raise HTTPException(status_code=403, detail="Non puoi recensire questo favore")
    
    # Check if already reviewed
    existing = await db.reviews.find_one({
        "favor_id": review_data.favor_id,
        "reviewer_id": current_user.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hai già recensito questo favore")
    
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Il rating deve essere tra 1 e 5")
    
    review_id = f"review_{uuid.uuid4().hex[:12]}"
    
    review_doc = {
        "review_id": review_id,
        "favor_id": review_data.favor_id,
        "reviewer_id": current_user.user_id,
        "reviewer_name": current_user.name,
        "reviewed_id": reviewed_id,
        "rating": review_data.rating,
        "comment": review_data.comment,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.reviews.insert_one(review_doc)
    
    # Update user's average rating
    reviews_cursor = db.reviews.find({"reviewed_id": reviewed_id}, {"_id": 0})
    reviews = await reviews_cursor.to_list(1000)
    if reviews:
        avg_rating = sum(r["rating"] for r in reviews) / len(reviews)
        await db.users.update_one(
            {"user_id": reviewed_id},
            {"$set": {"average_rating": round(avg_rating, 1)}}
        )
    
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
# USER PROFILE ENDPOINTS
# ========================

@api_router.get("/users/{user_id}", response_model=User)
async def get_user_profile(user_id: str):
    """Get a user's public profile"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return User(**user_doc)

# ========================
# HEALTH CHECK
# ========================

@api_router.get("/")
async def root():
    return {"message": "Scambio di Favori API", "status": "running"}

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
