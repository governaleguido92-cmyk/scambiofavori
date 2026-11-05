"""Accesso con Google: verifica diretta dell'ID token (firma, destinatario, scadenza, nonce), senza servizi di terzi in mezzo."""
import asyncio
import hashlib
import hmac
import os
import secrets
import time

import jwt
from fastapi import HTTPException
from jwt import PyJWKClient

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
NONCE_TTL_SECONDS = 600

# Gli ID client OAuth di Google (separati da virgola) per cui il token è valido: è l'«audience» che il token deve avere.
GOOGLE_CLIENT_IDS = [item.strip() for item in os.environ.get("GOOGLE_CLIENT_IDS", "").split(",") if item.strip()]

_jwk_client = PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True, lifespan=3600)


def _signature(secret: str, payload: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def make_nonce(secret: str) -> str:
    """Nonce firmato dal server: l'app lo mette nella richiesta a Google e lo rimanda indietro insieme al token."""
    payload = f"{secrets.token_urlsafe(16)}.{int(time.time())}"
    return f"{payload}.{_signature(secret, payload)}"


def check_nonce_format(secret: str, nonce: str) -> str:
    """Controlla firma e scadenza del nonce. Restituisce il nonce se valido, altrimenti 401."""
    parts = nonce.split(".")
    if len(parts) != 3 or not parts[1].isdigit():
        raise HTTPException(status_code=401, detail="Accesso con Google non valido")
    payload = f"{parts[0]}.{parts[1]}"
    if not secrets.compare_digest(_signature(secret, payload).encode(), parts[2].encode()):
        raise HTTPException(status_code=401, detail="Accesso con Google non valido")
    if time.time() - int(parts[1]) > NONCE_TTL_SECONDS:
        raise HTTPException(status_code=401, detail="Accesso con Google scaduto: riprova")
    return nonce


def _decode(id_token: str) -> dict:
    signing_key = _jwk_client.get_signing_key_from_jwt(id_token).key
    return jwt.decode(
        id_token,
        signing_key,
        algorithms=["RS256"],
        audience=GOOGLE_CLIENT_IDS,
        issuer=GOOGLE_ISSUERS,
        leeway=30,
        options={"require": ["exp", "iat", "aud", "iss", "sub"]},
    )


async def verify_google_id_token(id_token: str, nonce: str) -> dict:
    """Restituisce le informazioni dell'utente (email, nome, foto) se il token è davvero di Google e per questa app."""
    if not GOOGLE_CLIENT_IDS:
        raise HTTPException(status_code=503, detail="Accesso con Google non ancora attivo")
    try:
        claims = await asyncio.to_thread(_decode, id_token)
    except Exception:  # firma, scadenza, destinatario o rete: all'utente basta sapere che non è valido
        raise HTTPException(status_code=401, detail="Accesso con Google non valido")
    token_nonce = claims.get("nonce")
    if not isinstance(token_nonce, str) or not secrets.compare_digest(token_nonce.encode(), nonce.encode()):
        raise HTTPException(status_code=401, detail="Accesso con Google non valido")
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email or claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google non ha verificato questa email")
    name = claims.get("name") if isinstance(claims.get("name"), str) and claims.get("name").strip() else email.split("@")[0]
    picture = claims.get("picture") if isinstance(claims.get("picture"), str) else None
    return {"email": email, "name": name[:100], "picture": picture}
