"""Luoghi pubblici vicino a un favore, da dati OpenStreetMap.

Due servizi pubblici con compiti diversi:
- Overpass, per "tutti i bar / le farmacie / le piazze" attorno al favore. È gratuito ma a volte lento (decine di
  secondi) o occupato: per questo una sola interrogazione per zona copre tutte le categorie, il risultato resta in
  copia nel database per settimane e viene preparato in anticipo quando si pubblica un favore;
- Photon, per chi scrive un nome ("Bar Roma"): risposta rapida, tenendo solo i luoghi vicini al favore.

Il centro della ricerca è sempre la posizione già approssimata del favore, arrotondata a circa 100 metri: a
OpenStreetMap non arrivano posizioni esatte né dati degli utenti.
"""
import asyncio
import logging
import math
import os
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
PHOTON_URL = os.environ.get("PHOTON_URL", "https://photon.komoot.io/api/")
USER_AGENT = "ScambioFavori/1.0 (infoapp@scambiofavori.it)"
ATTRIBUTION = "© OpenStreetMap contributors"
OVERPASS_TIMEOUT_SECONDS = 60.0  # il servizio pubblico a volte impiega decine di secondi
PHOTON_TIMEOUT_SECONDS = 8.0
NAME_SEARCH_RADIUS_M = 3000
DEFAULT_RADIUS_M = 1000
MAX_RESULTS = 20
AREA_LIMIT = 400  # quanti luoghi tenere in copia per zona
PARSED_LIMIT = 100  # per le ricerche per nome
DUPLICATE_DISTANCE_M = 60
MAX_WAIT_SECONDS = 25.0  # oltre questo tempo chi cerca riceve "riprova tra poco" e il lavoro continua in sottofondo
AREA_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60  # i luoghi cambiano di rado
NAME_CACHE_TTL_SECONDS = 60 * 60
CACHE_MAX_ENTRIES = 500
BUSY_STATUSES = frozenset({429, 502, 503, 504})  # il servizio è occupato: vale la pena riprovare
OVERPASS_ATTEMPTS = 2
OVERPASS_RETRY_DELAY_SECONDS = 2.0


class PlacesUnavailable(Exception):
    """OpenStreetMap non risponde o ha risposto in modo non valido."""


class PlacesPending(PlacesUnavailable):
    """L'elenco della zona è in preparazione: tra poco sarà pronto."""


# Categoria -> parole che la richiamano e coppie chiave/valore di OpenStreetMap
CATEGORIES: dict[str, dict[str, Any]] = {
    "bar": {"words": ("bar", "caffe", "caffetteria", "pub"), "selectors": (("amenity", "^(cafe|bar|pub)$"),)},
    "square": {"words": ("piazza", "piazzetta"), "selectors": (("place", "^square$"),)},
    "pharmacy": {"words": ("farmacia",), "selectors": (("amenity", "^pharmacy$"),)},
    "park": {"words": ("parco", "giardino", "giardini", "villa"), "selectors": (("leisure", "^(park|garden)$"),)},
    "church": {"words": ("chiesa", "parrocchia"), "selectors": (("amenity", "^place_of_worship$"),)},
    "supermarket": {"words": ("supermercato", "market", "alimentari"), "selectors": (("shop", "^(supermarket|convenience)$"),)},
    "station": {"words": ("stazione", "fermata"), "selectors": (("railway", "^station$"), ("amenity", "^bus_station$"))},
}


def fold(text: str) -> str:
    """Minuscolo e senza accenti, per confrontare testi scritti in modi diversi."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char)).strip()


def resolve_category(text: Optional[str]) -> Optional[str]:
    """La categoria richiamata da una sola parola ("Bar", "caffè", "farmacia"); None se non è una di queste."""
    if not text:
        return None
    word = fold(text)
    for key, category in CATEGORIES.items():
        if word in category["words"]:
            return key
    return None


def build_query(lat: float, lon: float, radius_m: int) -> str:
    """Interrogazione Overpass per tutte le categorie. Dentro entrano solo numeri e le coppie fisse qui sopra."""
    area = f"around:{int(radius_m)},{round(lat, 3)},{round(lon, 3)}"
    clauses = [
        f'nwr["{tag}"~"{pattern}"]({area});'
        for category in CATEGORIES.values()
        for tag, pattern in category["selectors"]
    ]
    return f"[out:json][timeout:50];({''.join(clauses)});out center tags {AREA_LIMIT * 2};"


def _category_of_tags(tags: dict[str, str]) -> str:
    amenity, leisure, shop, place, railway = (tags.get(k, "") for k in ("amenity", "leisure", "shop", "place", "railway"))
    if amenity in ("cafe", "bar", "pub"):
        return "bar"
    if amenity == "pharmacy":
        return "pharmacy"
    if amenity == "place_of_worship":
        return "church"
    if amenity == "bus_station" or railway == "station":
        return "station"
    if leisure in ("park", "garden"):
        return "park"
    if shop in ("supermarket", "convenience"):
        return "supermarket"
    if place == "square":
        return "square"
    return "other"


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distanza in metri (formula di Haversine)."""
    earth_radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return earth_radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _coordinates(element: dict[str, Any]) -> Optional[tuple[float, float]]:
    if isinstance(element.get("lat"), (int, float)) and isinstance(element.get("lon"), (int, float)):
        return float(element["lat"]), float(element["lon"])
    center = element.get("center")
    if isinstance(center, dict) and isinstance(center.get("lat"), (int, float)) and isinstance(center.get("lon"), (int, float)):
        return float(center["lat"]), float(center["lon"])
    return None


def _street(tags: dict[str, str]) -> Optional[str]:
    street = (tags.get("addr:street") or "").strip()
    if not street:
        return None
    number = (tags.get("addr:housenumber") or "").strip()
    return f"{street} {number}".strip()


def parse_places(
    elements: list[Any], center_lat: float, center_lon: float, category: Optional[str] = None, limit: int = MAX_RESULTS
) -> list[dict[str, Any]]:
    """Dai dati di OpenStreetMap ai soli luoghi con nome, dal più vicino, senza doppioni."""
    found: list[dict[str, Any]] = []
    for element in elements:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags")
        coords = _coordinates(element)
        name = (tags.get("name") or "").strip() if isinstance(tags, dict) else ""
        if not name or coords is None:
            continue
        found.append(
            {
                "id": f"{element.get('type', 'node')}/{element.get('id', '')}",
                "name": name,
                "category": category or _category_of_tags(tags),
                "distance_m": int(round(distance_m(center_lat, center_lon, *coords))),
                "street": _street(tags),
                "_coords": coords,
            }
        )
    found.sort(key=lambda place: place["distance_m"])

    unique: list[dict[str, Any]] = []
    for place in found:
        duplicate = any(
            fold(kept["name"]) == fold(place["name"]) and distance_m(*kept["_coords"], *place["_coords"]) < DUPLICATE_DISTANCE_M
            for kept in unique
        )
        if not duplicate:
            unique.append(place)
    return [{key: value for key, value in place.items() if key != "_coords"} for place in unique[:limit]]


# ---------- copie ----------

class PlacesCache:
    """Copia in memoria con scadenza. Stessa interfaccia asincrona della copia nel database."""

    def __init__(
        self, ttl_seconds: float = AREA_CACHE_TTL_SECONDS, clock: Callable[[], float] = time.monotonic, max_entries: int = CACHE_MAX_ENTRIES
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        self._max = max_entries
        self._data: dict[Any, tuple[float, Any]] = {}

    async def get(self, key: Any) -> Any:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._data[key]
            return None
        return value

    async def set(self, key: Any, value: Any) -> None:
        if len(self._data) >= self._max and key not in self._data:
            oldest = min(self._data, key=lambda k: self._data[k][0])
            del self._data[oldest]
        self._data[key] = (self._clock() + self._ttl, value)


def _naive_utc(moment: datetime) -> datetime:
    return moment.astimezone(timezone.utc).replace(tzinfo=None) if moment.tzinfo else moment


class MongoPlacesCache:
    """Copia nel database: sopravvive ai riavvii del server, che su un piano gratuito sono frequenti."""

    def __init__(
        self,
        collection: Callable[[], Any],
        ttl_seconds: float = AREA_CACHE_TTL_SECONDS,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._collection = collection
        self._ttl = ttl_seconds
        self._clock = clock

    @staticmethod
    def _id(key: Any) -> str:
        return "|".join(str(part) for part in key)

    async def get(self, key: Any) -> Any:
        document = await self._collection().find_one({"_id": self._id(key)})
        if not document:
            return None
        if _naive_utc(self._clock()) >= _naive_utc(document["expires_at"]):
            return None
        return document["value"]

    async def set(self, key: Any, value: Any) -> None:
        document = {"_id": self._id(key), "value": value, "expires_at": self._clock() + timedelta(seconds=self._ttl)}
        await self._collection().replace_one({"_id": document["_id"]}, document, upsert=True)


default_cache: Any = PlacesCache(ttl_seconds=AREA_CACHE_TTL_SECONDS)  # sostituita con quella del database all'avvio
name_cache: Any = PlacesCache(ttl_seconds=NAME_CACHE_TTL_SECONDS)


# ---------- Overpass: tutte le categorie di una zona ----------

Fetcher = Callable[[float, float, int], Awaitable[list[Any]]]


async def fetch_overpass_elements(
    lat: float,
    lon: float,
    radius_m: int = DEFAULT_RADIUS_M,
    transport: Optional[httpx.AsyncBaseTransport] = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> list[Any]:
    """Chiede a Overpass i luoghi della zona. Se il servizio è occupato riprova una volta."""
    query = build_query(lat, lon, radius_m)
    try:
        async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}, transport=transport) as client:
            for attempt in range(OVERPASS_ATTEMPTS):
                response = await client.post(OVERPASS_URL, data={"data": query})
                if response.status_code in BUSY_STATUSES and attempt + 1 < OVERPASS_ATTEMPTS:
                    await sleep(OVERPASS_RETRY_DELAY_SECONDS)
                    continue
                break
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise PlacesUnavailable(str(error)) from error
    elements = payload.get("elements") if isinstance(payload, dict) else None
    if not isinstance(elements, list):
        raise PlacesUnavailable("Risposta inattesa da Overpass")
    return elements


_inflight: dict[Any, "asyncio.Future[list[dict[str, Any]]]"] = {}


def _log_background_failure(key: Any, task: "asyncio.Future[Any]") -> None:
    _inflight.pop(key, None)
    if not task.cancelled() and task.exception() is not None:
        logger.warning("Ricerca luoghi in sottofondo non riuscita: %s", task.exception())


async def _fill_area(lat: float, lon: float, radius_m: int, fetch: Fetcher, cache: Any, key: Any) -> list[dict[str, Any]]:
    elements = await fetch(lat, lon, radius_m)
    result = parse_places(elements, lat, lon, None, limit=AREA_LIMIT)
    await cache.set(key, result)
    return result


async def search_area(
    lat: float,
    lon: float,
    radius_m: int = DEFAULT_RADIUS_M,
    fetch: Optional[Fetcher] = None,
    cache: Any = None,
    max_wait_seconds: Optional[float] = MAX_WAIT_SECONDS,
) -> list[dict[str, Any]]:
    """Tutti i luoghi con nome attorno al punto, dal più vicino.

    Richieste uguali e contemporanee condividono la stessa interrogazione. Se questa è lenta, chi aspetta riceve
    PlacesPending dopo `max_wait_seconds`, mentre il lavoro prosegue e riempie la copia per la volta dopo.
    """
    fetch = fetch or fetch_overpass_elements
    cache = cache or default_cache
    lat, lon = round(lat, 3), round(lon, 3)
    key = ("area", lat, lon, radius_m)
    cached = await cache.get(key)
    if cached is not None:
        return cached
    task = _inflight.get(key)
    if task is None:
        task = asyncio.ensure_future(_fill_area(lat, lon, radius_m, fetch, cache, key))
        _inflight[key] = task
        task.add_done_callback(lambda finished, k=key: _log_background_failure(k, finished))
    try:
        return await asyncio.wait_for(asyncio.shield(task), max_wait_seconds)
    except asyncio.TimeoutError:
        raise PlacesPending("Elenco dei luoghi in preparazione") from None


async def search(
    lat: float,
    lon: float,
    category: str,
    radius_m: int = DEFAULT_RADIUS_M,
    fetch: Optional[Fetcher] = None,
    cache: Any = None,
    max_wait_seconds: Optional[float] = MAX_WAIT_SECONDS,
) -> list[dict[str, Any]]:
    """I luoghi di una categoria vicino al punto."""
    area = await search_area(lat, lon, radius_m, fetch=fetch, cache=cache, max_wait_seconds=max_wait_seconds)
    return [place for place in area if place["category"] == category]


async def warm(
    lat: float, lon: float, radius_m: int = DEFAULT_RADIUS_M, fetch: Optional[Fetcher] = None, cache: Any = None
) -> None:
    """Prepara in anticipo l'elenco della zona. Non solleva mai errori: è solo un'ottimizzazione."""
    try:
        await search_area(lat, lon, radius_m, fetch=fetch, cache=cache, max_wait_seconds=None)
    except Exception as error:  # noqa: BLE001 - un fallimento qui non deve disturbare chi pubblica
        logger.info("Preparazione dei luoghi non riuscita: %s", error)


_background_tasks: set["asyncio.Task[None]"] = set()


def _task_finished(task: "asyncio.Task[None]") -> None:
    _background_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        logger.warning("Preparazione dei luoghi interrotta: %s", task.exception())


def schedule_warm(lat: float, lon: float) -> None:
    """Avvia `warm` in sottofondo (se non è disattivato con PLACES_WARM_ENABLED=0)."""
    if os.environ.get("PLACES_WARM_ENABLED", "1") == "0":
        return
    task = asyncio.ensure_future(warm(lat, lon))
    _background_tasks.add(task)
    task.add_done_callback(_task_finished)


# ---------- Photon: ricerca per nome ----------

# Cosa di Photon è un luogo in cui incontrarsi: attività, negozi, svago, trasporti, piazze. Restano fuori
# città, confini amministrativi, zone d'uso del suolo e strade.
_PHOTON_PLACE_KEYS = ("amenity", "shop", "leisure", "tourism", "railway", "public_transport", "historic")


def _photon_is_meeting_place(properties: dict[str, Any]) -> bool:
    key, value = properties.get("osm_key"), properties.get("osm_value")
    if key == "place":
        return value == "square"
    return key in _PHOTON_PLACE_KEYS


def parse_photon(
    features: list[Any], center_lat: float, center_lon: float, max_distance_m: int, limit: int = MAX_RESULTS
) -> list[dict[str, Any]]:
    """Dai risultati di Photon ai luoghi con nome entro la distanza massima dal centro, dal più vicino."""
    elements: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        coordinates = (feature.get("geometry") or {}).get("coordinates")
        if not isinstance(properties, dict) or not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        if not _photon_is_meeting_place(properties):
            continue
        tags = {
            "name": properties.get("name") or "",
            properties.get("osm_key", ""): properties.get("osm_value", ""),
            "addr:street": (properties.get("street") or "").strip(),
            "addr:housenumber": properties.get("housenumber") or "",
        }
        elements.append(
            {
                "type": {"N": "node", "W": "way", "R": "relation"}.get(properties.get("osm_type"), "node"),
                "id": properties.get("osm_id", ""),
                "lat": coordinates[1],
                "lon": coordinates[0],
                "tags": tags,
            }
        )
    nearby = parse_places(elements, center_lat, center_lon, None, limit=PARSED_LIMIT)
    return [place for place in nearby if place["distance_m"] <= max_distance_m][:limit]


async def fetch_photon_features(lat: float, lon: float, text: str) -> list[Any]:
    """Cerca per nome con Photon, dando la precedenza ai luoghi vicini al punto."""
    params = {"q": text, "lat": round(lat, 3), "lon": round(lon, 3), "limit": 40}
    try:
        async with httpx.AsyncClient(timeout=PHOTON_TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}) as client:
            response = await client.get(PHOTON_URL, params=params)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise PlacesUnavailable(str(error)) from error
    features = payload.get("features") if isinstance(payload, dict) else None
    if not isinstance(features, list):
        raise PlacesUnavailable("Risposta inattesa da Photon")
    return features


PhotonFetcher = Callable[[float, float, str], Awaitable[list[Any]]]


async def search_by_name(
    lat: float, lon: float, text: str, fetch: Optional[PhotonFetcher] = None, cache: Any = None
) -> list[dict[str, Any]]:
    """Luoghi il cui nome corrisponde al testo, vicino al punto. Maiuscole e spazi attorno non contano."""
    fetch = fetch or fetch_photon_features
    cache = cache or name_cache
    lat, lon = round(lat, 3), round(lon, 3)
    wanted = fold(text)
    key = ("name", lat, lon, wanted)
    cached = await cache.get(key)
    if cached is not None:
        return cached
    features = await fetch(lat, lon, wanted)
    result = parse_photon(features, lat, lon, NAME_SEARCH_RADIUS_M, limit=PARSED_LIMIT)
    await cache.set(key, result)
    return result
