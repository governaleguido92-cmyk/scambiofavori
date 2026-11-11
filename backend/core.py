"""Shared configuration, models, helpers and services (everything that is not an HTTP route)."""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import html as _html
import tempfile
from decimal import ROUND_HALF_UP, Decimal
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
import hashlib
import hmac
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
# CONSTANTS - CURRENCY "GRANELLI" 🌾
# ========================

WELCOME_GRANELLI = 3  # Granelli di Benvenuto
REFERRAL_BONUS = 2  # Bonus referral etico
GRANELLI_PER_HOUR = 1  # 1 ora = 1 granello

CURRENCY_NAME = "Granelli"  # "Ogni favore fatto è un granello di sabbia che costruisce la community"
CURRENCY_SYMBOL = "🌾"

# Privacy: approximate location radius in meters
PRIVACY_RADIUS_METERS = 300
PRIVACY_MIN_OFFSET_RATIO = 1 / 3  # never show a point closer than a third of the radius (100 m)

# Geofencing: max distance for QR exchange
MAX_EXCHANGE_DISTANCE_METERS = 30
MAX_GPS_TOLERANCE_METERS = 50  # quanto può allargare il limite l'incertezza dichiarata dal GPS

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
from moderation import check_text, normalize

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

# Frasi tipiche delle truffe: richieste di codici o credenziali, anticipi, ricariche, carte e IBAN.
# Il testo viene normalizzato (minuscolo) prima del confronto.
SCAM_HINT_PATTERNS = [
    # codici ricevuti per sms / di verifica / otp
    r'\bcodice\b[^.!?\n]{0,40}\b(sms|messaggio|verifica|otp|ricevuto|arriva|arrivato|conferma)\b',
    r'\b(sms|verifica|otp)\b[^.!?\n]{0,40}\bcodice\b',
    r'\b(manda|mandami|dammi|dimmi|invia|inviami|passami)\b[^.!?\n]{0,25}\b(password|pin|cvv|otp)\b',
    r'\b(anticipo|caparra|acconto)\b',
    r'\bricaric[ah]\w*\b',
    r'\bwestern\s*union\b',
    r'\bmoneygram\b',
    r'\bgift\s*card\b',
    r'\b(bitcoin|btc|crypto|criptovalut\w+|usdt|ethereum)\b',
    # IBAN italiano o europeo, anche con spazi
    r'\b[a-z]{2}\d{2}(?:\s?[a-z0-9]){11,30}\b',
    # numero di carta: 13-19 cifre, anche a gruppi
    r'\b(?:\d[ -]?){13,19}\b',
]


# Il link con la posizione che l'app stessa manda in chat: le sue coordinate lunghe non sono un numero di carta
APP_LOCATION_LINK = re.compile(r'https://maps\.google\.com/\?q=-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?(?![\w.,-])')


def contains_scam_hint(text: str) -> bool:
    """True se il testo somiglia a una truffa (codici, anticipi, ricariche, carte, IBAN, cripto)."""
    text_lower = APP_LOCATION_LINK.sub(' ', text.lower())
    return any(re.search(pattern, text_lower) for pattern in SCAM_HINT_PATTERNS)


# Inviti a continuare fuori dall'app: tipico dei truffatori, ma anche di chi vuole solo mettersi d'accordo.
# Per questo il messaggio passa e chi lo riceve vede un avviso accanto al messaggio.
OFF_APP_PATTERNS = [
    r'\b(whats\s*app|watsapp|telegram|signal|instagram|messenger|facebook|skype)\b',
    r'\b(scrivimi|contattami|chiamami|sentiamoci|parliamo)\b[^.!?\n]{0,30}\b(fuori|in privato|privat\w*)\b',
    r'\bfuori\s+dall\W?\s*app\b',
    r'\bin\s+privato\b',
]


def contains_off_app_contact(text: str) -> bool:
    """True se il testo invita a continuare la conversazione fuori dall'app."""
    text_lower = text.lower()
    return any(re.search(pattern, text_lower) for pattern in OFF_APP_PATTERNS)


# I favori si fanno sempre di persona: niente favori a distanza (online, videochiamata, da remoto...).
REMOTE_FAVOR_PATTERNS = [
    r'\bon[- ]?line\b',
    r'\ba distanza\b',
    r'\bda remoto\b',
    r'\bremot[oa]\b',
    r'\bvideo ?chiamat\w*',
    r'\bvideo ?call\b',
    r'\b(zoom|skype|google meet)\b',
    r'\bper telefono\b',
    r'\bvia chat\b',
]
REMOTE_FAVOR_MESSAGE = "I favori si fanno di persona: non sono ammessi favori a distanza. Scrivi dove e quando vi incontrate."


def contains_remote_favor(text: str) -> bool:
    """True se il testo descrive un favore a distanza (online, in videochiamata, da remoto...)."""
    text_lower = normalize(text or "")
    return any(re.search(pattern, text_lower) for pattern in REMOTE_FAVOR_PATTERNS)


def contains_offensive_language(text: str) -> bool:
    """True se il testo contiene insulti, odio e discriminazione, minacce o contenuti sessuali (vedi moderation.py)."""
    return not check_text(text).allowed

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
    
    # Insulti, odio e discriminazione, minacce, contenuti sessuali
    verdict = check_text(text)
    if not verdict.allowed:
        return {
            "allowed": False,
            "reason": verdict.reason,
            "warnings": [verdict.category]
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

def ensure_text_allowed(*texts: Optional[str]) -> None:
    """Ferma con un errore 400 se uno dei testi liberi contiene odio, minacce, contenuti sessuali o insulti."""
    for text in texts:
        verdict = check_text(text)
        if not verdict.allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Contenuto non consentito: {verdict.reason}. Modifica il testo e riprova.",
            )

# ========================
# EMAIL SENDING HELPER
# ========================

async def send_verification_email(to_email: str, code: str, user_name: str):
    """Send verification email via Resend"""
    if not RESEND_API_KEY:
        logger.info("[EMAIL MOCK] verification email not sent (no RESEND_API_KEY)")
        return False
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background-color: #0F1A14; color: #FFFFFF; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D5A3D; margin: 0;">Scambio Favori</h1>
            <p style="color: #B8D4C0; margin-top: 8px;">Verifica il tuo account</p>
        </div>
        <div style="background-color: #1A2E22; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #FFFFFF; margin: 0 0 8px 0;">Ciao <strong>{_html.escape(user_name)}</strong>,</p>
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
        "subject": "Scambio Favori - Codice di Verifica",
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
# Colori dei badge: solo la palette del logo (oliva, arancione e le loro sfumature)
BADGES = {
    "primo_passo": {
        "id": "primo_passo", "name": "Primo Passo", "description": "Hai completato il tuo primo favore",
        "icon": "footsteps", "color": "#98AA4A", "requirement": {"type": "first_favor", "value": 1},
    },
    "eroe_quartiere": {
        "id": "eroe_quartiere", "name": "Eroe di Quartiere",
        "description": "Hai aiutato 5 volte: il Fondo Solidarietà si sblocca per te!",
        "icon": "trophy", "color": "#F87828", "requirement": {"type": "favors_given", "value": 5},
    },
    "pilastro_quartiere": {
        "id": "pilastro_quartiere", "name": "Pilastro del Quartiere", "description": "Hai aiutato 20 volte",
        "icon": "home", "color": "#7A8B3A", "requirement": {"type": "favors_given", "value": 20},
    },
    "fulmine": {
        "id": "fulmine", "name": "Fulmine", "description": "Hai dato una mano in 10 favori brevi (fino a un'ora)",
        "icon": "flash", "color": "#FB9A52", "requirement": {"type": "micro_favors", "value": 10},
    },
    "vicino_di_casa": {
        "id": "vicino_di_casa", "name": "Vicino di Casa", "description": "Hai aiutato 5 persone diverse",
        "icon": "people-circle", "color": "#98AA4A", "requirement": {"type": "distinct_neighbors", "value": 5},
    },
    "puntuale": {
        "id": "puntuale", "name": "Puntuale",
        "description": "Hai aiutato 10 volte e quasi mai hai annullato dopo aver accettato",
        "icon": "time", "color": "#F87828", "requirement": {"type": "punctual", "value": 10},
    },
    "saggio_community": {
        "id": "saggio_community", "name": "Saggio della Community",
        "description": "Hai ricevuto il massimo dei voti da 10 persone diverse",
        "icon": "school", "color": "#7A8B3A", "requirement": {"type": "perfect_reviews", "value": 10},
    },
    "vicino_virtuoso": {
        "id": "vicino_virtuoso", "name": "Vicino Virtuoso",
        "description": "Media superiore a 4,5 stelle con almeno 10 recensioni",
        "icon": "ribbon", "color": "#98AA4A", "requirement": {"type": "high_rating", "value": 4.5},
    },
    "garante_fidato": {
        "id": "garante_fidato", "name": "Garante Fidato",
        "description": "Hai garantito per 3 vicini e nessuno di loro è stato messo in revisione",
        "icon": "shield-checkmark", "color": "#F87828", "requirement": {"type": "vouches", "value": 3},
    },
    "mentore": {
        "id": "mentore", "name": "Mentore", "description": "Hai invitato 5 persone che hanno completato il primo favore",
        "icon": "people", "color": "#7A8B3A", "requirement": {"type": "referrals", "value": 5},
    },
    "organizzatore": {
        "id": "organizzatore", "name": "Organizzatore",
        "description": "Hai organizzato 3 eventi o ritrovi del quartiere a cui qualcuno ha partecipato",
        "icon": "calendar", "color": "#FB9A52", "requirement": {"type": "events_with_guests", "value": 3},
    },
    "benvenuto": {
        "id": "benvenuto", "name": "Benvenuto!", "description": "Hai dato il benvenuto a 10 nuovi vicini",
        "icon": "hand-right", "color": "#98AA4A", "requirement": {"type": "welcomes_given", "value": 10},
    },
    "cuore_oro": {
        "id": "cuore_oro", "name": "Cuore Generoso", "description": f"Hai donato almeno 10 {CURRENCY_NAME} al Fondo Solidarietà",
        "icon": "heart", "color": "#F87828", "requirement": {"type": "donations", "value": 10},
    },
    "profilo_completo": {
        "id": "profilo_completo", "name": "Profilo Completo", "description": "Hai completato il tuo profilo",
        "icon": "checkmark-circle", "color": "#7A8B3A", "requirement": {"type": "profile_complete", "value": 1},
    },
}

# Quanti annullamenti dopo l'accettazione si tollerano per "Puntuale" (sul totale di favori dati più annullati)
PUNCTUAL_MAX_LATE_RATE = 0.10
# Un favore "breve" per Fulmine: fino a un'ora
MICRO_FAVOR_MAX_HOURS = 1.0

# User role titles based on stats
def get_user_title(user_doc: dict) -> str:
    """Get user's community title based on their stats"""
    badges = user_doc.get("badges", [])
    rating = user_doc.get("average_rating", 0)

    if "vicino_virtuoso" in badges:
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

def email_match(email: str) -> dict:
    """Filtro Mongo che trova l'email senza badare alle maiuscole (vecchi account inclusi)."""
    return {"email": {"$regex": f"^{re.escape(email.strip())}$", "$options": "i"}}

class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    referral_code: Optional[str] = None
    # AAAA-MM-GG. Opzionale solo perché le versioni vecchie dell'app non la inviano: l'app attuale la chiede sempre.
    birth_date: Optional[str] = None

    @field_validator("email")
    @classmethod
    def strip_email(cls, value: str) -> str:
        return value.strip().lower()

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
    bio: Optional[str] = None  # "Chi sono": breve presentazione pubblica
    granelli: int = WELCOME_GRANELLI  # Currency renamed to Granelli
    total_favors_given: int = 0
    total_favors_received: int = 0
    micro_favors_completed: int = 0
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
    phone_verified: bool = False  # telefono confermato con il codice via SMS
    phone_masked: Optional[str] = None  # solo le ultime cifre, mai il numero intero
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


# Un favore resta in elenco al massimo questi giorni: poi scade e i Granelli che teneva fermi tornano liberi
MAX_FAVOR_VALIDITY_DAYS = 5
# La scadenza si sceglie in ore: da 1 ora a 5 giorni
HOURS_PER_DAY = 24
MIN_FAVOR_VALIDITY_HOURS = 1
MAX_FAVOR_VALIDITY_HOURS = MAX_FAVOR_VALIDITY_DAYS * HOURS_PER_DAY


def favor_validity_hours(validity_hours: Optional[int], validity_days: Optional[int]) -> int:
    """Ore di vita dell'annuncio. Le app nuove mandano le ore; quelle vecchie solo i giorni (1-5)."""
    if validity_hours is not None:
        return validity_hours
    days = max(1, min(MAX_FAVOR_VALIDITY_DAYS, validity_days if validity_days is not None else 3))
    return days * HOURS_PER_DAY


def ensure_whole_hours(hours: Optional[float]) -> Optional[float]:
    """La durata di un favore va di ora in ora, da 1 in su: niente mezze ore (1 ora = 1 Granello)."""
    if hours is not None and (hours < 1 or not float(hours).is_integer()):
        raise ValueError("La durata va in ore intere, almeno 1")
    return hours


def validity_days_for_old_apps(validity_hours: int) -> int:
    """Le app vecchie leggono ancora validity_days: poche ore contano come 1 giorno."""
    return max(1, -(-validity_hours // HOURS_PER_DAY))


class FavorCreate(BaseModel):
    type: str = Field(max_length=20)  # "offer" or "request"
    title: str = Field(max_length=120)
    description: str = Field(max_length=2000)
    category: str = Field(max_length=60)
    duration_hours: float = Field(default=1.0, gt=0, le=999, allow_inf_nan=False)
    validity_days: int = Field(default=3, ge=0, le=365)  # App vecchie: durata annuncio in giorni (il server la limita a 1-5)
    # App nuove: scadenza in ore intere, da 1 ora a 5 giorni. Se c'è, vince sui giorni.
    validity_hours: Optional[int] = Field(default=None, ge=MIN_FAVOR_VALIDITY_HOURS, le=MAX_FAVOR_VALIDITY_HOURS)
    # Solo numeri finiti e coordinate vere: un NaN salvato romperebbe l'elenco dei favori per tutti
    latitude: Optional[float] = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    address: Optional[str] = Field(default=None, max_length=200)

    _whole_hours = field_validator("duration_hours")(ensure_whole_hours)

class FavorUpdate(BaseModel):
    """Campi modificabili di un favore non ancora accettato. Tipo, autore e posizione non si cambiano."""
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    duration_hours: Optional[float] = None
    validity_days: Optional[int] = None
    validity_hours: Optional[int] = Field(default=None, ge=MIN_FAVOR_VALIDITY_HOURS, le=MAX_FAVOR_VALIDITY_HOURS)

    _whole_hours = field_validator("duration_hours")(ensure_whole_hours)

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
    validity_days: int = 3  # Durata annuncio in giorni (per le app vecchie)
    validity_hours: Optional[int] = None  # Durata annuncio in ore (manca nei favori creati prima)
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
    creator_in_debt: bool = False  # For priority highlighting in feed
    qr_code: Optional[str] = None
    checkin_completed: bool = False
    created_at: datetime
    completed_at: Optional[datetime] = None

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
    accuracy_meters: Optional[float] = None  # incertezza del GPS dichiarata dal telefono

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
    name: str = Field(max_length=120)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    address: Optional[str] = Field(default=None, max_length=200)

class MessageCreate(BaseModel):
    favor_id: str = Field(max_length=64)
    content: str = Field(max_length=2000)
    message_type: Optional[str] = Field(default="text", max_length=20)  # text, meeting_point, image
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
    off_app_contact: bool = False  # Invita a continuare fuori dall'app: chi riceve vede un avviso
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

def decode_jwt_payload(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:  # include anche i token scaduti
        return None


def decode_jwt_token(token: str) -> Optional[str]:
    payload = decode_jwt_payload(token)
    return payload.get("user_id") if payload else None

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
    if not stored_code:
        raise HTTPException(status_code=400, detail="Codice non valido. Richiedi un nuovo codice.")
    # Il tentativo si prenota in modo atomico PRIMA del confronto: tentativi paralleli
    # non possono superare il limite leggendo tutti lo stesso contatore.
    await db.users.update_one({**query, attempts_field: {"$exists": False}}, {"$set": {attempts_field: 0}})
    reserved = await db.users.update_one(
        {**query, attempts_field: {"$lt": MAX_CODE_ATTEMPTS}},
        {"$inc": {attempts_field: 1}},
    )
    if reserved.modified_count == 0:
        raise HTTPException(status_code=400, detail="Codice non valido. Richiedi un nuovo codice.")
    if not secrets.compare_digest(str(stored_code).encode("utf-8"), str(provided_code).encode("utf-8")):
        fresh = await db.users.find_one(query, {"_id": 0, attempts_field: 1}) or {}
        if fresh.get(attempts_field, 0) >= MAX_CODE_ATTEMPTS:
            await db.users.update_one(query, {"$unset": {field: "" for field in code_fields}})
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
        "app": "Scambio Favori"
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
    """Get current user from the Authorization header or the session cookie.

    L'intestazione ha la precedenza e, se il suo accesso non vale, si prova il cookie (e viceversa): un cookie vecchio
    rimasto nel browser non deve oscurare un accesso valido.
    """
    candidates = []
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        candidates.append(auth_header.split(" ", 1)[1])
    # Il cookie vale solo per richieste di lettura: un sito terzo può far partire una richiesta che modifica dati
    # (CSRF) solo se il browser allega da solo il cookie, quindi per scrivere serve sempre l'intestazione Authorization.
    cookie_token = request.cookies.get("session_token")
    if cookie_token and request.method in ("GET", "HEAD", "OPTIONS") and cookie_token not in candidates:
        candidates.append(cookie_token)

    if not candidates:
        raise HTTPException(status_code=401, detail="Non autenticato")

    last_error: Optional[HTTPException] = None
    for session_token in candidates:
        try:
            return await _user_from_session_token(session_token)
        except HTTPException as error:
            last_error = error
    raise last_error


def _session_predates_cutoff(payload: dict, user_doc: dict) -> bool:
    """True se l'accesso (JWT) è stato emesso prima che l'account venisse messo al sicuro (sessions_valid_after)."""
    cutoff = user_doc.get("sessions_valid_after")
    if not cutoff:
        return False
    cutoff = cutoff if cutoff.tzinfo else cutoff.replace(tzinfo=timezone.utc)
    issued = payload.get("iat")
    return issued is None or datetime.fromtimestamp(issued, timezone.utc) < cutoff


async def _user_from_session_token(session_token: str) -> User:
    payload = decode_jwt_payload(session_token)
    user_id = payload.get("user_id") if payload else None
    if user_id:
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user_doc and not _session_predates_cutoff(payload, user_doc):
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

def approximate_location(lat: float, lon: float, radius_meters: int = PRIVACY_RADIUS_METERS, seed: Optional[str] = None) -> tuple:
    """
    Add an offset to create approximate location for privacy.
    With a seed (the user id) the offset is always the same for that user,
    so publishing many favors from one spot cannot be averaged to find it.
    Returns (approx_lat, approx_lon)
    """
    # Convert radius from meters to degrees (approximately)
    radius_deg = radius_meters / 111000  # 1 degree ≈ 111km
    
    # Random angle and distance; the minimum offset keeps the shown point
    # from landing right on top of the real one.
    if seed:
        digest = hmac.new(JWT_SECRET.encode(), f"approx-location:{seed}".encode(), hashlib.sha256).digest()
        unit_a = int.from_bytes(digest[:8], "big") / 2**64
        unit_d = int.from_bytes(digest[8:16], "big") / 2**64
    else:
        unit_a, unit_d = random.random(), random.random()
    angle = unit_a * 2 * math.pi
    distance = radius_deg * (PRIVACY_MIN_OFFSET_RATIO + unit_d * (1 - PRIVACY_MIN_OFFSET_RATIO))
    
    offset_lat = distance * math.cos(angle)
    offset_lon = distance * math.sin(angle) / math.cos(math.radians(lat))
    
    return (lat + offset_lat, lon + offset_lon)

async def _distinct_neighbors_helped(user_id: str) -> int:
    """Quante persone diverse hai aiutato (favori completati in cui tu eri chi aiuta)."""
    favors = await db.favors.find(
        {"status": "completed", "$or": [{"creator_id": user_id}, {"accepted_by": user_id}]},
        {"_id": 0, "type": 1, "creator_id": 1, "accepted_by": 1},
    ).to_list(1000)
    receivers = set()
    for favor in favors:
        helper, receiver = (favor["creator_id"], favor.get("accepted_by")) if favor.get("type") == "offer" else (favor.get("accepted_by"), favor["creator_id"])
        if helper == user_id and receiver:
            receivers.add(receiver)
    return len(receivers)


async def badge_progress(user_doc: dict) -> dict:
    """Per ogni badge: a che punto sei (current), il traguardo (target), se è ottenuto e se per ora è bloccato."""
    user_id = user_doc["user_id"]
    owned = set(user_doc.get("badges", []))
    given = user_doc.get("total_favors_given", 0)
    received = user_doc.get("total_favors_received", 0)
    rating = user_doc.get("average_rating", 0) or 0

    late = await db.favors.count_documents({"status": "cancelled", "cancelled_by": user_id, "cancelled_after_accept": True})
    review_count = await db.reviews.count_documents({"reviewed_id": user_id})
    vouches = await db.vouches.find({"voucher_id": user_id}, {"_id": 0, "vouchee_id": 1}).to_list(100)
    vouchees_on_hold = await db.users.count_documents(
        {"user_id": {"$in": [v["vouchee_id"] for v in vouches]}, "safety_hold": True}) if vouches else 0
    needs_neighbors = any(b["requirement"]["type"] == "distinct_neighbors" and bid not in owned for bid, b in BADGES.items())
    neighbors = await _distinct_neighbors_helped(user_id) if needs_neighbors else 0

    current = {
        "first_favor": given + received, "favors_given": given, "micro_favors": user_doc.get("micro_favors_completed", 0),
        "distinct_neighbors": neighbors, "punctual": given,
        "perfect_reviews": user_doc.get("perfect_reviews_count", 0), "high_rating": review_count,
        "vouches": len(vouches), "referrals": user_doc.get("successful_referrals", 0),
        "events_with_guests": user_doc.get("events_with_guests", 0), "welcomes_given": user_doc.get("welcomes_given", 0),
        "donations": user_doc.get("total_donations", 0), "profile_complete": 1 if "profilo_completo" in owned else 0,
    }
    late_rate = late / (given + late) if (given + late) else 0

    result = {}
    for badge_id, info in BADGES.items():
        req = info["requirement"]
        kind = req["type"]
        target = 10 if kind == "high_rating" else req["value"]
        value = current[kind]
        blocked = (
            (kind == "punctual" and late_rate > PUNCTUAL_MAX_LATE_RATE)
            or (kind == "high_rating" and review_count >= 10 and rating < req["value"])
            or (kind == "vouches" and vouchees_on_hold > 0)
        )
        done = badge_id in owned or (value >= target and not blocked)
        result[badge_id] = {"current": min(value, target), "target": target, "earned": done, "blocked": bool(blocked and not done)}
    return result


async def check_and_award_badges(user_id: str):
    """Assegna i badge nuovi (e avvisa chi li ottiene)."""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return
    owned = set(user_doc.get("badges", []))
    new_badges = [bid for bid, state in (await badge_progress(user_doc)).items()
                  if state["earned"] and bid not in owned and BADGES[bid]["requirement"]["type"] != "profile_complete"]
    if not new_badges:
        return
    await db.users.update_one({"user_id": user_id}, {"$push": {"badges": {"$each": new_badges}}})
    if "eroe_quartiere" in new_badges:
        # Il Fondo Solidarietà si sblocca aiutando gli altri, non solo ricevendo aiuto
        await db.users.update_one({"user_id": user_id}, {"$set": {"can_access_solidarity_fund": True}})
    for badge_id in new_badges:
        badge_line = f"🏅 Nuovo badge: «{BADGES[badge_id]['name']}»"
        if await merge_into_completion_notification(user_id, badge_line, max_age_seconds=180):
            continue
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "badge_earned",
            "title": "Nuovo badge! 🏅", "message": f"Hai ottenuto «{BADGES[badge_id]['name']}»: {BADGES[badge_id]['description']}",
            "related_id": badge_id, "read": False, "created_at": datetime.now(timezone.utc),
        })

async def merge_into_completion_notification(user_id: str, line: str, favor_id: Optional[str] = None,
                                             max_age_seconds: Optional[int] = None) -> bool:
    """Aggiunge una riga alla notifica «Favore completato» ancora da leggere, invece di crearne un'altra:
    recensione, ciclo completato e badge arrivano insieme in una sola voce. False se non c'è dove unirla."""
    query = {"user_id": user_id, "type": "favor_completed", "read": False}
    if favor_id:
        query["related_id"] = favor_id
    if max_age_seconds:
        query["created_at"] = {"$gte": datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)}
    target = await db.notifications.find_one(query, sort=[("created_at", -1)])
    if not target:
        return False
    await db.notifications.update_one(
        {"notification_id": target["notification_id"]},
        {"$set": {"message": f"{target['message']}\n{line}", "created_at": datetime.now(timezone.utc)}},
    )
    return True


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
    score += sum(1 for badge in user_doc.get("badges", []) if badge in BADGES) * 25
    score += int(user_doc.get("average_rating", 0) * 10)
    score += int(user_doc.get("average_kindness", 0) * 10)
    score += int(user_doc.get("average_impact", 0) * 10)
    
    # Calculate Social Impact Score (for the Social Impact Bar)
    total_favors = user_doc.get("total_favors_given", 0) + user_doc.get("total_favors_received", 0)
    social_impact = total_favors * 20  # 20 points per favor
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

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
# Bundle id(s) the identity token must be issued for (comma separated override via env).
APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_CLIENT_IDS", "it.scambiofavori.app").split(",") if a.strip()]
_apple_jwks_client = None


def get_apple_signing_key(identity_token: str):
    """Fetch (and cache) the Apple public key that signed this token. Blocking: call it from a thread."""
    global _apple_jwks_client
    if _apple_jwks_client is None:
        _apple_jwks_client = jwt.PyJWKClient(APPLE_JWKS_URL, cache_keys=True, lifespan=3600)
    return _apple_jwks_client.get_signing_key_from_jwt(identity_token).key


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

async def daily_hours_load(user_id: str) -> dict:
    """Ore di oggi già fatte più quelle dei favori accettati e ancora da fare: servono a capire se ne entra un altro."""
    done = await check_daily_hours_limit(user_id)
    open_docs = await db.favors.find(
        {"status": "accepted", "$or": [{"creator_id": user_id}, {"accepted_by": user_id}]}, {"_id": 0, "duration_hours": 1}
    ).to_list(100)
    committed = sum(f.get("duration_hours", 0) for f in open_docs)
    used = done["total_hours_today"] + committed
    return {"limit": MAX_DAILY_HOURS, "used": used, "remaining": max(0, MAX_DAILY_HOURS - used)}


async def ensure_daily_hours_for_accept(favor: "Favor", acceptor_id: str) -> None:
    """Il limite giornaliero si controlla quando si accetta, prima del lavoro: chi ha fatto il favore viene sempre pagato."""
    for user_id, mine in ((acceptor_id, True), (favor.creator_id, False)):
        load = await daily_hours_load(user_id)
        if load["used"] + favor.duration_hours > MAX_DAILY_HOURS:
            if mine:
                detail = (f"Oggi hai già {load['used']:g} ore tra favori fatti e accettati su {MAX_DAILY_HOURS}: "
                          f"questo ne richiede {favor.duration_hours:g}. Riprova domani o concludi prima un favore.")
            else:
                detail = "Questo favore oggi non si può accettare: chi l'ha pubblicato ha già raggiunto il limite giornaliero. Riprova domani."
            raise HTTPException(status_code=403, detail=detail)


async def log_security_transaction(
    favor_id: str,
    creator_id: str,
    accepted_by: str,
    duration_hours: float,
    granelli_cost: int,
    latitude: float = None,
    longitude: float = None,
    qr_code: str = None,
    distance_m: float = None,
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
        "distance_m": round(distance_m) if distance_m is not None else None,
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
            "total_hours_helped": favor.duration_hours,
            **({"micro_favors_completed": 1} if favor.duration_hours <= MICRO_FAVOR_MAX_HOURS else {}),
        }}
    )
    return helper_id, payer_id

class QRVerifyRequest(BaseModel):
    qr_code: str = Field(max_length=600)
    # Posizione di chi scansiona: serve per essere sicuri che sia sul posto (non viene conservata)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    accuracy_meters: Optional[float] = Field(default=None, ge=0, le=100000, allow_inf_nan=False)

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
# TELEFONO VERIFICATO (SMS)
# ========================
# Il telefono si verifica solo alla registrazione (l'app lo chiede se questo valore è true, vedi /api/config). Pubblicare o
# accettare un favore non lo richiede mai. Spento finché non è configurato un servizio SMS.
PHONE_VERIFICATION_REQUIRED = os.environ.get("PHONE_VERIFICATION_REQUIRED", "false").lower() == "true"

# Se true, per confermare un favore serve la posizione del telefono (si deve essere sul posto). Da accendere quando la maggior
# parte degli utenti ha l'app che la invia: le versioni vecchie non la mandano e non potrebbero più confermare.
PROXIMITY_REQUIRED = os.environ.get("PROXIMITY_REQUIRED", "false").lower() == "true"
# I favori si completano solo con il codice QR (mostrato da chi riceve, scansionato da chi esegue). Il vecchio "Completa" senza QR
# resta spento; si riaccende solo per i test o in emergenza con MANUAL_COMPLETION_ENABLED=true.
# Alla scansione del QR serve la posizione di chi scansiona (deve essere sul posto). QR_LOCATION_REQUIRED=false solo in emergenza.
QR_LOCATION_REQUIRED = os.environ.get("QR_LOCATION_REQUIRED", "true").lower() == "true"
MANUAL_COMPLETION_ENABLED = os.environ.get("MANUAL_COMPLETION_ENABLED", "false").lower() == "true"
PHONE_CODE_TTL_MINUTES = 10
PHONE_RESEND_SECONDS = 60
PHONE_MAX_REQUESTS_PER_HOUR = 5


def hash_secret_value(value: str) -> str:
    """Impronta con chiave segreta: così numeri e codici non restano in chiaro nel database."""
    return hmac.new(JWT_SECRET.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def mask_phone(e164: str) -> str:
    return "••••" + e164[-4:]


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

def to_minor_units(amount: float) -> int:
    """Convert a decimal currency amount (e.g. euros) to integer minor units (cents) as Stripe expects."""
    return int((Decimal(str(amount)) * 100).to_integral_value(rounding=ROUND_HALF_UP))


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

SKILL_MATCH_GROUP_WINDOW = timedelta(hours=6)  # avvisi sulle competenze raggruppati entro questo tempo


async def create_skill_match_notifications(favor_doc: dict):
    """Create notifications for users whose skills match the favor's category"""
    # Find users with matching skills who are not the favor creator
    matching_users = await db.users.find({
        "skills": favor_doc["category"],
        "user_id": {"$ne": favor_doc["creator_id"]},
        "notifications_enabled": {"$ne": False}
    }, {"_id": 0, "user_id": 1}).to_list(100)
    
    notifications = []
    window_start = datetime.now(timezone.utc) - SKILL_MATCH_GROUP_WINDOW
    for user in matching_users:
        # Se c'è già un avviso di questo tipo non letto, si aggiorna invece di crearne un altro (e niente nuova push)
        existing = await db.notifications.find_one_and_update(
            {"user_id": user["user_id"], "type": "skill_match", "read": False, "created_at": {"$gte": window_start}},
            {"$inc": {"count": 1}, "$set": {"favor_id": favor_doc["favor_id"], "created_at": datetime.now(timezone.utc),
                                            "last_title": favor_doc["title"]}},
        )
        if existing:
            total = existing.get("count", 1) + 1
            await db.notifications.update_one(
                {"notification_id": existing["notification_id"]},
                {"$set": {"title": "Nuovi favori per te!",
                          "message": f"{total} favori da donare vicino a te nelle tue competenze. Ultimo: '{favor_doc['title']}'"}},
            )
            continue
        notifications.append({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "type": "skill_match",
            "title": "Nuovo favore per te!",
            "message": f"C'è un favore da donare vicino a te: '{favor_doc['title']}' nella categoria {favor_doc['category']}",
            "favor_id": favor_doc["favor_id"],
            "count": 1,
            "read": False,
            "created_at": datetime.now(timezone.utc)
        })

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
