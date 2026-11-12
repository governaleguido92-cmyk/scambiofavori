"""Nome del paese o della città del quartiere, da OpenStreetMap (Nominatim, ricerca inversa a livello di comune).

Al servizio arrivano solo coordinate arrotondate a 0,01 gradi (circa 1 km), mai la posizione precisa né dati delle
persone. Il nome di una zona non cambia: il risultato resta in copia per un giorno ed è condiviso da tutti.
Nominatim chiede al massimo una richiesta al secondo: le richieste passano una alla volta, distanziate.
"""
import asyncio
import os
import time
from typing import Awaitable, Callable, Optional

import httpx

NOMINATIM_REVERSE_URL = os.environ.get("NOMINATIM_REVERSE_URL", "https://nominatim.openstreetmap.org/reverse")
USER_AGENT = "ScambioFavori/1.0 (infoapp@scambiofavori.it)"
TIMEOUT_SECONDS = 6.0
CACHE_SECONDS = 24 * 60 * 60
CACHE_MAX_ENTRIES = 2000
CELL_DECIMALS = 2
MAX_NAME_LENGTH = 60
MUNICIPALITY_ZOOM = 10  # livello di dettaglio di Nominatim che restituisce il comune, non la via
MIN_SECONDS_BETWEEN_CALLS = 1.1
# Campi dell'indirizzo che contengono il nome del comune, dal più grande al più piccolo
CITY_FIELDS = ("city", "town", "village", "municipality", "hamlet")

Fetcher = Callable[[float, float], Awaitable[dict]]


class LocalityUnavailable(Exception):
    """Il servizio non risponde o ha risposto in modo non valido."""


_cache: dict[tuple, tuple] = {}


def _now() -> float:
    return time.monotonic()


def clear_cache() -> None:
    _cache.clear()


def _clean(name: object) -> Optional[str]:
    if not isinstance(name, str):
        return None
    text = " ".join(name.split())[:MAX_NAME_LENGTH]
    return text or None


def city_from_response(raw: dict) -> Optional[str]:
    """Il nome del comune dalla risposta di Nominatim; None se il punto è in mare aperto o fuori da ogni comune."""
    if not isinstance(raw, dict):
        raise LocalityUnavailable("Risposta inattesa da Nominatim")
    address = raw.get("address") or {}
    for field in CITY_FIELDS:
        city = _clean(address.get(field))
        if city:
            return city
    if raw.get("addresstype") in CITY_FIELDS:
        return _clean(raw.get("name"))
    return None


_lock = asyncio.Lock()
_last_call = {"at": 0.0}


async def fetch_reverse(lat: float, lon: float) -> dict:
    params = {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": MUNICIPALITY_ZOOM, "accept-language": "it"}
    async with _lock:
        wait = _last_call["at"] + MIN_SECONDS_BETWEEN_CALLS - _now()
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}) as client:
                response = await client.get(NOMINATIM_REVERSE_URL, params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise LocalityUnavailable(str(error)) from error
        finally:
            _last_call["at"] = _now()


async def get_city(lat: float, lon: float, fetch: Optional[Fetcher] = None) -> Optional[str]:
    """Nome del paese che contiene il punto, con copia di un giorno per ogni cella di circa 1 km."""
    cell = (round(lat, CELL_DECIMALS), round(lon, CELL_DECIMALS))
    cached = _cache.get(cell)
    if cached and cached[0] > _now():
        return cached[1]
    city = city_from_response(await (fetch or fetch_reverse)(*cell))
    if len(_cache) >= CACHE_MAX_ENTRIES:
        _cache.clear()
    _cache[cell] = (_now() + CACHE_SECONDS, city)
    return city
