"""Meteo del quartiere da Open-Meteo (open-meteo.com, dati CC BY 4.0).

Al fornitore arrivano solo coordinate arrotondate a 0,1 gradi (celle di circa 10 km), mai la posizione precisa, e il
risultato è condiviso tra tutti gli utenti della stessa cella per 30 minuti.
"""
import time
from typing import Any, Awaitable, Callable, Optional

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_SECONDS = 6.0
CACHE_SECONDS = 30 * 60
CELL_DECIMALS = 1
SOURCE = "Open-Meteo"

# Codici meteo WMO: (descrizione, icona)
_CODES = (
    ((0,), ("Sereno", "sunny")),
    ((1,), ("Prevalentemente sereno", "partly")),
    ((2,), ("Parzialmente nuvoloso", "partly")),
    ((3,), ("Coperto", "cloudy")),
    ((45, 48), ("Nebbia", "fog")),
    ((51, 53, 55, 56, 57), ("Pioggia leggera", "rainy")),
    ((61, 63, 65, 66, 67), ("Pioggia", "rainy")),
    ((71, 73, 75, 77, 85, 86), ("Neve", "snow")),
    ((80, 81, 82), ("Rovesci", "rainy")),
    ((95, 96, 99), ("Temporale", "thunder")),
)
_BY_CODE = {code: value for codes, value in _CODES for code in codes}

Fetcher = Callable[[float, float], Awaitable[dict]]


class WeatherUnavailable(Exception):
    """Il servizio meteo non risponde o ha risposto in modo non valido."""


_cache: dict[tuple, tuple] = {}


def _now() -> float:
    return time.monotonic()


def clear_cache() -> None:
    _cache.clear()


def describe(code: Any) -> tuple:
    return _BY_CODE.get(code, ("Variabile", "cloudy"))


def _day(daily: dict, index: int) -> dict:
    description, icon = describe(daily["weather_code"][index])
    return {
        "min": round(daily["temperature_2m_min"][index]),
        "max": round(daily["temperature_2m_max"][index]),
        "rain_chance": int(daily.get("precipitation_probability_max", [0] * 3)[index] or 0),
        "description": description,
        "icon": icon,
    }


def parse_forecast(raw: dict) -> dict:
    """Dalla risposta di Open-Meteo a quello che l'app mostra: adesso, oggi e domani."""
    try:
        current, daily = raw["current"], raw["daily"]
        description, icon = describe(current["weather_code"])
        return {
            "temperature": round(current["temperature_2m"]),
            "feels_like": round(current.get("apparent_temperature", current["temperature_2m"])),
            "wind_kmh": round(current.get("wind_speed_10m", 0)),
            "description": description,
            "icon": icon,
            "today": _day(daily, 0),
            "tomorrow": _day(daily, 1),
            "source": SOURCE,
        }
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise WeatherUnavailable("Risposta inattesa da Open-Meteo") from error


async def fetch_forecast(lat: float, lon: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "Europe/Rome",
        "forecast_days": 2,
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise WeatherUnavailable(str(error)) from error


async def get_weather(lat: float, lon: float, fetch: Optional[Fetcher] = None) -> dict:
    """Meteo della cella che contiene il punto, con cache di 30 minuti."""
    cell = (round(lat, CELL_DECIMALS), round(lon, CELL_DECIMALS))
    cached = _cache.get(cell)
    if cached and cached[0] > _now():
        return cached[1]
    raw = await (fetch or fetch_forecast)(*cell)
    parsed = parse_forecast(raw)
    _cache[cell] = (_now() + CACHE_SECONDS, parsed)
    return parsed
