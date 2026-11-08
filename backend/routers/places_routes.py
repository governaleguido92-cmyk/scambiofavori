"""HTTP routes: luoghi pubblici vicino a un favore (punto d'incontro)."""
from typing import Optional

from fastapi import APIRouter
from core import *  # noqa: F401,F403
import places
from routers.neighborhood_routes import _position_points

api_router = APIRouter(prefix="/api")

# Le copie dei luoghi stanno nel database, così sopravvivono ai riavvii del server.
places.default_cache = places.MongoPlacesCache(lambda: db.places_cache)

QUERY_MAX_LENGTH = 40


@api_router.get("/favors/{favor_id}/places")
@limiter.limit("30/minute")
async def find_meeting_places(
    request: Request,
    favor_id: str,
    category: Optional[str] = None,
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Bar, piazze, farmacie... vicino al favore, per scegliere un punto d'incontro.

    Il centro è la posizione approssimata del favore (quella che vedono già tutti), mai quella esatta.
    """
    text = (q or "").strip()
    if len(text) > QUERY_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Il testo cercato è troppo lungo")
    if category is not None and category not in places.CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria di luogo non valida")
    if category is None and not text:
        raise HTTPException(status_code=400, detail="Indica una categoria o scrivi cosa cerchi")

    favor = await db.favors.find_one({"favor_id": favor_id}, {"_id": 0})
    if not favor:
        raise HTTPException(status_code=404, detail="Favore non trovato")
    if current_user.user_id not in (favor.get("creator_id"), favor.get("accepted_by")):
        raise HTTPException(status_code=403, detail="Non sei un partecipante di questo favore")
    lat, lon = favor.get("approximate_latitude"), favor.get("approximate_longitude")
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Questo favore non ha una posizione")

    # Una parola come "bar" o "farmacia" sceglie la categoria (Overpass: tutti i luoghi di quel tipo vicino al favore);
    # altro testo cerca per nome (Photon: veloce, solo luoghi vicini). Categoria e testo insieme: il testo filtra per nome.
    name_filter: Optional[str] = None
    if category is None:
        category = places.resolve_category(text)
        if category is None:
            name_filter = text
    elif text:
        name_filter = text

    try:
        if category is None:
            found = await places.search_by_name(lat, lon, text)
        else:
            found = await places.search_with_fallback(lat, lon, category)
            if name_filter:
                wanted = places.fold(name_filter)
                found = [place for place in found if wanted in places.fold(place["name"])]
    except places.PlacesPending:
        raise HTTPException(
            status_code=503,
            detail="Sto ancora preparando l'elenco dei luoghi di questa zona: riprova tra un minuto, oppure scrivi tu dove incontrarvi.",
        )
    except places.PlacesUnavailable:
        logger.warning("Ricerca luoghi non disponibile per il favore %s", favor_id)
        raise HTTPException(status_code=503, detail="Non riesco a cercare i luoghi adesso: scrivi tu dove incontrarvi.")

    return {"places": found[: places.MAX_RESULTS], "attribution": places.ATTRIBUTION}


@api_router.get("/neighborhood/places")
@limiter.limit("30/minute")
async def find_neighborhood_places(
    request: Request,
    category: Optional[str] = None,
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Luoghi pubblici entro 15 km da chi organizza qualcosa nel quartiere (eventi, avvisi): piazze, bar, parchi, spiagge, porti...

    Il centro è la posizione approssimata già usata dal quartiere (favori aperti o profilo), mai quella esatta.
    """
    text = (q or "").strip()
    if len(text) > QUERY_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Il testo cercato è troppo lungo")
    if category is not None and category not in places.CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria di luogo non valida")
    if category is None and not text:
        raise HTTPException(status_code=400, detail="Indica una categoria o scrivi cosa cerchi")

    points = await _position_points(current_user.user_id)
    if not points:
        raise HTTPException(status_code=403, detail="Serve una posizione per cercare i luoghi vicino a te.")
    lat, lon = points[0]

    name_filter: Optional[str] = None
    if category is None:
        category = places.resolve_category(text)
        if category is None:
            name_filter = text
    elif text:
        name_filter = text

    try:
        if category is None:
            found = await places.search_by_name(lat, lon, text, max_distance_m=places.NEIGHBORHOOD_RADIUS_M)
        else:
            found = await places.search_category_neighborhood(lat, lon, category)
            if name_filter:
                wanted = places.fold(name_filter)
                found = [place for place in found if wanted in places.fold(place["name"])]
    except places.PlacesPending:
        raise HTTPException(
            status_code=503,
            detail="Sto ancora preparando l'elenco dei luoghi della tua zona: riprova tra un minuto, oppure scrivi tu il luogo.",
        )
    except places.PlacesUnavailable:
        logger.warning("Ricerca luoghi del quartiere non disponibile")
        raise HTTPException(status_code=503, detail="Non riesco a cercare i luoghi adesso: scrivi tu il luogo.")

    return {"places": found[: places.MAX_RESULTS], "attribution": places.ATTRIBUTION, "radius_km": places.NEIGHBORHOOD_RADIUS_M // 1000}
