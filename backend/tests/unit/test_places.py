"""Ricerca di luoghi pubblici vicino al favore (OpenStreetMap): logica, copie, preparazione in anticipo e rotta."""
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import places
from conftest import auth, make_favor, make_user

CENTER = (37.931, 12.331)


def osm_node(osm_id, name, lat, lon, **tags):
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": {"name": name, **tags}}


def osm_way(osm_id, name, lat, lon, **tags):
    return {"type": "way", "id": osm_id, "center": {"lat": lat, "lon": lon}, "tags": {"name": name, **tags}}


def bar(osm_id, name, lat, lon):
    return osm_node(osm_id, name, lat, lon, amenity="cafe")


def photon_feature(osm_id, name, lat, lon, key="amenity", value="cafe", **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"osm_type": "N", "osm_id": osm_id, "name": name, "osm_key": key, "osm_value": value, **props},
    }


# ---------- logica pura ----------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("bar", "bar"),
        ("Bar", "bar"),
        ("caffè", "bar"),
        ("caffetteria", "bar"),
        ("piazza", "square"),
        ("farmacia", "pharmacy"),
        ("parco", "park"),
        ("giardini", "park"),
        ("chiesa", "church"),
        ("supermercato", "supermarket"),
        ("stazione", "station"),
        ("  BAR  ", "bar"),
        ("bar roma", None),
        ("xyz", None),
        ("", None),
        (None, None),
    ],
)
def test_resolve_category_understands_common_words(text, expected):
    assert places.resolve_category(text) == expected


def test_query_covers_every_category_around_the_rounded_center():
    query = places.build_query(37.9312, 12.3314, 1000)

    assert "around:1000,37.931,12.331" in query
    for tag in ("cafe", "square", "pharmacy", "place_of_worship", "supermarket", "station", "park"):
        assert tag in query
    assert "out center" in query


def test_parse_orders_by_distance_and_skips_unnamed_places():
    elements = [
        bar(1, "Bar Lontano", 37.940, 12.331),
        bar(2, "Bar Vicino", 37.9312, 12.331),
        {"type": "node", "id": 3, "lat": 37.9311, "lon": 12.331, "tags": {"amenity": "bar"}},  # senza nome
    ]

    result = places.parse_places(elements, *CENTER, None, limit=10)

    assert [p["name"] for p in result] == ["Bar Vicino", "Bar Lontano"]
    assert result[0]["distance_m"] < result[1]["distance_m"]


@pytest.mark.parametrize(
    "tags,category",
    [
        ({"amenity": "cafe"}, "bar"),
        ({"amenity": "pub"}, "bar"),
        ({"amenity": "pharmacy"}, "pharmacy"),
        ({"amenity": "place_of_worship"}, "church"),
        ({"leisure": "garden"}, "park"),
        ({"shop": "convenience"}, "supermarket"),
        ({"place": "square"}, "square"),
        ({"railway": "station"}, "station"),
        ({"amenity": "bus_station"}, "station"),
        ({"man_made": "tower"}, "other"),
    ],
)
def test_category_is_read_from_the_tags(tags, category):
    [place] = places.parse_places([osm_node(1, "X", 37.9312, 12.331, **tags)], *CENTER, None, limit=5)

    assert place["category"] == category


def test_parse_uses_center_of_ways_and_builds_street():
    elements = [osm_way(5, "Farmacia Centrale", 37.9315, 12.3312, amenity="pharmacy", **{"addr:street": "Via Roma", "addr:housenumber": "12"})]

    [place] = places.parse_places(elements, *CENTER, None, limit=10)

    assert place["street"] == "Via Roma 12"
    assert isinstance(place["distance_m"], int)


def test_parse_merges_duplicates_of_the_same_place():
    # lo stesso locale può comparire come punto e come edificio
    elements = [bar(1, "Bar Roma", 37.9312, 12.3310), osm_way(2, "Bar Roma", 37.93121, 12.33101, amenity="cafe")]

    assert len(places.parse_places(elements, *CENTER, None, limit=10)) == 1


def test_parse_respects_the_limit():
    elements = [bar(i, f"Bar {i}", 37.931 + i * 0.0001, 12.331) for i in range(1, 30)]

    assert len(places.parse_places(elements, *CENTER, None, limit=5)) == 5


def test_parse_ignores_malformed_elements():
    elements = [{"type": "node", "id": 1}, {"tags": {"name": "Senza coordinate"}}, "non un dizionario", bar(2, "Bar Ok", 37.9312, 12.331)]

    assert [p["name"] for p in places.parse_places(elements, *CENTER, None, limit=10)] == ["Bar Ok"]


def test_photon_keeps_nearby_named_places_ordered_by_distance():
    features = [
        photon_feature(1, "Bar Lontano", 37.940, 12.331),
        photon_feature(2, "Bar Vicino", 37.9312, 12.331, street="Via Roma", housenumber="3"),
        photon_feature(3, "Bar Lontanissimo", 38.5, 12.331),
    ]

    result = places.parse_photon(features, *CENTER, max_distance_m=3000, limit=10)

    assert [p["name"] for p in result] == ["Bar Vicino", "Bar Lontano"]
    assert result[0]["street"] == "Via Roma 3"
    assert result[0]["category"] == "bar"


def test_photon_drops_cities_boundaries_and_unnamed_results():
    features = [
        photon_feature(1, "Favignana", 37.9312, 12.331, key="place", value="town"),
        photon_feature(2, "Comune di Favignana", 37.9312, 12.331, key="boundary", value="administrative"),
        photon_feature(3, "Zona commerciale", 37.9312, 12.331, key="landuse", value="commercial"),
        photon_feature(4, "Piazza Europa", 37.9313, 12.331, key="place", value="square"),
        {"type": "Feature", "geometry": {"coordinates": [12.331, 37.9312]}, "properties": {"osm_key": "amenity", "osm_value": "bar"}},
    ]

    result = places.parse_photon(features, *CENTER, max_distance_m=3000, limit=10)

    assert [p["name"] for p in result] == ["Piazza Europa"]
    assert result[0]["category"] == "square"


def test_photon_ignores_malformed_features():
    features = ["x", {"properties": {"name": "Senza geometria"}}, {"geometry": {"coordinates": []}, "properties": {"name": "Vuoto"}}]

    assert places.parse_photon(features, *CENTER, max_distance_m=3000, limit=10) == []


# ---------- copie, richieste uguali, attesa, preparazione ----------

def memory_cache(now=None):
    return places.PlacesCache(ttl_seconds=60, clock=(lambda: now["t"]) if now else (lambda: 0.0))


async def test_area_is_fetched_once_and_filtered_by_category():
    calls = []

    async def fake_fetch(lat, lon, radius_m):
        calls.append((lat, lon, radius_m))
        return [bar(1, "Bar Roma", 37.9312, 12.331), osm_node(2, "Farmacia Sole", 37.9320, 12.331, amenity="pharmacy")]

    cache = memory_cache()

    bars = await places.search(37.9314, 12.3311, "bar", 1000, fetch=fake_fetch, cache=cache)
    pharmacies = await places.search(37.9314, 12.3311, "pharmacy", 1000, fetch=fake_fetch, cache=cache)

    assert [p["name"] for p in bars] == ["Bar Roma"]
    assert [p["name"] for p in pharmacies] == ["Farmacia Sole"]
    assert calls == [(37.931, 12.331, 1000)]  # una sola chiamata per tutte le categorie, con il centro arrotondato


async def test_cache_expires():
    now = {"t": 0.0}
    calls = []

    async def fake_fetch(lat, lon, radius_m):
        calls.append(1)
        return []

    cache = memory_cache(now)

    await places.search_area(37.931, 12.331, 1000, fetch=fake_fetch, cache=cache)
    now["t"] = 61.0
    await places.search_area(37.931, 12.331, 1000, fetch=fake_fetch, cache=cache)

    assert len(calls) == 2


async def test_failed_fetch_is_not_cached():
    attempts = []

    async def flaky_fetch(lat, lon, radius_m):
        attempts.append(1)
        if len(attempts) == 1:
            raise places.PlacesUnavailable("giù")
        return [bar(1, "Bar Roma", 37.9312, 12.331)]

    cache = memory_cache()

    with pytest.raises(places.PlacesUnavailable):
        await places.search_area(37.931, 12.331, 1000, fetch=flaky_fetch, cache=cache)
    retry = await places.search_area(37.931, 12.331, 1000, fetch=flaky_fetch, cache=cache)

    assert len(retry) == 1


async def test_identical_simultaneous_requests_share_one_fetch():
    calls = []

    async def slow_fetch(lat, lon, radius_m):
        calls.append(1)
        await asyncio.sleep(0.05)
        return [bar(1, "Bar Roma", 37.9312, 12.331)]

    cache = memory_cache()

    results = await asyncio.gather(*[places.search_area(37.931, 12.331, 1000, fetch=slow_fetch, cache=cache) for _ in range(5)])

    assert len(calls) == 1
    assert all(len(r) == 1 for r in results)


async def test_slow_fetch_gives_up_waiting_but_keeps_working_in_background():
    calls = []

    async def slow_fetch(lat, lon, radius_m):
        calls.append(1)
        await asyncio.sleep(0.15)
        return [bar(1, "Bar Roma", 37.9312, 12.331)]

    cache = memory_cache()

    with pytest.raises(places.PlacesPending):
        await places.search_area(37.931, 12.331, 1000, fetch=slow_fetch, cache=cache, max_wait_seconds=0.02)
    await asyncio.sleep(0.25)  # il lavoro in sottofondo finisce da solo
    later = await places.search_area(37.931, 12.331, 1000, fetch=slow_fetch, cache=cache, max_wait_seconds=0.02)

    assert len(later) == 1
    assert len(calls) == 1  # il secondo tentativo è servito dalla copia


async def test_pending_is_also_an_unavailable_error():
    assert issubclass(places.PlacesPending, places.PlacesUnavailable)


async def test_warm_fills_the_cache_and_never_raises():
    calls = []

    async def fake_fetch(lat, lon, radius_m):
        calls.append(1)
        return [bar(1, "Bar Roma", 37.9312, 12.331)]

    async def broken_fetch(lat, lon, radius_m):
        raise places.PlacesUnavailable("giù")

    cache = memory_cache()

    await places.warm(37.931, 12.331, fetch=fake_fetch, cache=cache)
    again = await places.search_area(37.931, 12.331, 1000, fetch=broken_fetch, cache=cache)
    await places.warm(37.99, 12.4, fetch=broken_fetch, cache=cache)  # non deve sollevare errori

    assert len(again) == 1 and len(calls) == 1


async def test_name_search_is_cached_and_ignores_case():
    calls = []

    async def fake_photon(lat, lon, text):
        calls.append(text)
        return [photon_feature(1, "Bar Roma", 37.9312, 12.331)]

    cache = memory_cache()

    first = await places.search_by_name(37.931, 12.331, "Bar Roma", fetch=fake_photon, cache=cache)
    again = await places.search_by_name(37.931, 12.331, "  bar roma ", fetch=fake_photon, cache=cache)

    assert first == again
    assert len(calls) == 1


async def test_mongo_cache_keeps_values_and_expires_them(app_db):
    now = {"t": datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)}
    cache = places.MongoPlacesCache(lambda: app_db.places_cache, ttl_seconds=3600, clock=lambda: now["t"])
    value = [{"id": "node/1", "name": "Bar Roma", "category": "bar", "distance_m": 90, "street": None}]

    assert await cache.get(("area", 37.931, 12.331, 1000)) is None
    await cache.set(("area", 37.931, 12.331, 1000), value)
    assert await cache.get(("area", 37.931, 12.331, 1000)) == value
    now["t"] += timedelta(hours=2)

    assert await cache.get(("area", 37.931, 12.331, 1000)) is None


async def test_mongo_cache_overwrites_the_same_area(app_db):
    cache = places.MongoPlacesCache(lambda: app_db.places_cache, ttl_seconds=3600)

    await cache.set(("area", 1, 2, 3), [{"name": "Vecchio"}])
    await cache.set(("area", 1, 2, 3), [{"name": "Nuovo"}])

    assert await cache.get(("area", 1, 2, 3)) == [{"name": "Nuovo"}]
    assert await app_db.places_cache.count_documents({}) == 1


# ---------- chiamate a Overpass (con risposte finte) ----------

def overpass_transport(responses):
    """Un trasporto httpx che risponde in sequenza con gli stati/JSON indicati."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        status, body = responses[min(calls["n"], len(responses) - 1)]
        calls["n"] += 1
        return httpx.Response(status, json=body) if isinstance(body, (dict, list)) else httpx.Response(status, text=body)

    return httpx.MockTransport(handler), calls


async def no_sleep(_seconds):
    return None


async def test_overpass_returns_the_elements_of_a_good_answer():
    transport, calls = overpass_transport([(200, {"elements": [bar(1, "Bar Roma", 37.9312, 12.331)]})])

    elements = await places.fetch_overpass_elements(37.931, 12.331, 1000, transport=transport, sleep=no_sleep)

    assert len(elements) == 1 and calls["n"] == 1


async def test_overpass_retries_once_when_the_service_is_busy():
    transport, calls = overpass_transport([(429, "troppe richieste"), (200, {"elements": [bar(1, "Bar Roma", 37.9312, 12.331)]})])

    elements = await places.fetch_overpass_elements(37.931, 12.331, 1000, transport=transport, sleep=no_sleep)

    assert len(elements) == 1 and calls["n"] == 2


async def test_overpass_gives_up_after_two_busy_answers():
    transport, calls = overpass_transport([(504, "timeout"), (502, "gateway"), (200, {"elements": []})])

    with pytest.raises(places.PlacesUnavailable):
        await places.fetch_overpass_elements(37.931, 12.331, 1000, transport=transport, sleep=no_sleep)

    assert calls["n"] == 2  # non si insiste oltre il secondo tentativo


async def test_overpass_does_not_retry_real_errors():
    transport, calls = overpass_transport([(400, "query non valida"), (200, {"elements": []})])

    with pytest.raises(places.PlacesUnavailable):
        await places.fetch_overpass_elements(37.931, 12.331, 1000, transport=transport, sleep=no_sleep)

    assert calls["n"] == 1


@pytest.mark.parametrize("body", ["non è json", {"senza": "elements"}, {"elements": "no"}])
async def test_overpass_unexpected_answers_are_unavailable(body):
    transport, _ = overpass_transport([(200, body)])

    with pytest.raises(places.PlacesUnavailable):
        await places.fetch_overpass_elements(37.931, 12.331, 1000, transport=transport, sleep=no_sleep)


# ---------- rotta ----------

def favor_with_position(**extra):
    return make_favor(
        status="accepted",
        approximate_latitude=37.93149,
        approximate_longitude=12.33051,
        exact_latitude=37.9000,
        exact_longitude=12.3000,
        **extra,
    )


@pytest.fixture
def fake_osm(monkeypatch):
    """Sostituisce le chiamate a OpenStreetMap e registra con cosa sono state fatte."""
    calls = []
    area = [
        bar(1, "Bar Roma", 37.9318, 12.3312),
        bar(2, "Caffè Centrale", 37.9330, 12.3300),
        osm_node(3, "Farmacia Sole", 37.9320, 12.3310, amenity="pharmacy"),
    ]

    async def fake_fetch(lat, lon, radius_m):
        calls.append({"lat": lat, "lon": lon, "category": None, "radius": radius_m})
        return area

    async def fake_photon(lat, lon, text):
        calls.append({"lat": lat, "lon": lon, "category": None, "text": text})
        return [
            photon_feature(10, "Pizzeria Roma", 37.9318, 12.3312, value="restaurant"),
            photon_feature(11, "Bar Roma Nuovo", 37.9322, 12.3310),
            photon_feature(12, "Roma Bar", 38.9, 12.3),
        ]

    monkeypatch.setattr(places, "fetch_overpass_elements", fake_fetch)
    monkeypatch.setattr(places, "fetch_photon_features", fake_photon)
    monkeypatch.setattr(places, "default_cache", places.PlacesCache(ttl_seconds=60))
    monkeypatch.setattr(places, "name_cache", places.PlacesCache(ttl_seconds=60))
    return calls


async def seed(app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper"), make_user("stranger")])
    await app_db.favors.insert_one(favor_with_position())


async def test_category_search_returns_nearby_named_places(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 200
    body = response.json()
    assert [p["name"] for p in body["places"]] == ["Bar Roma", "Caffè Centrale"]
    assert "OpenStreetMap" in body["attribution"]


async def test_typing_a_known_word_picks_the_category(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"q": "farmacia"}, headers=auth("helper"))

    assert response.status_code == 200
    assert [p["name"] for p in response.json()["places"]] == ["Farmacia Sole"]


async def test_other_text_searches_by_name_near_the_favor(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"q": "roma"}, headers=auth("creator"))

    # "Roma Bar" è a più di 100 km: scartato. Il centro è la posizione approssimata arrotondata.
    assert [p["name"] for p in response.json()["places"]] == ["Pizzeria Roma", "Bar Roma Nuovo"]
    assert fake_osm[0]["lat"] == 37.931 and fake_osm[0]["lon"] == 12.331


async def test_category_plus_text_filters_the_category_results_by_name(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar", "q": "centrale"}, headers=auth("creator"))

    assert [p["name"] for p in response.json()["places"]] == ["Caffè Centrale"]


async def test_search_uses_the_approximate_rounded_position_never_the_exact_one(client, app_db, fake_osm):
    await seed(app_db)

    await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert fake_osm[0]["lat"] == 37.931
    assert fake_osm[0]["lon"] == 12.331


async def test_only_participants_can_search(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("stranger"))

    assert response.status_code == 403
    assert fake_osm == []


async def test_requires_login(client, app_db, fake_osm):
    await seed(app_db)

    assert (await client.get("/api/favors/favor_1/places", params={"category": "bar"})).status_code == 401


async def test_unknown_favor_is_404(client, app_db, fake_osm):
    await app_db.users.insert_one(make_user("creator"))

    response = await client.get("/api/favors/nope/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 404


@pytest.mark.parametrize("params", [{}, {"category": "casinò"}, {"q": "x" * 60}, {"q": "   "}])
async def test_invalid_requests_are_rejected(client, app_db, fake_osm, params):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params=params, headers=auth("creator"))

    assert response.status_code == 400
    assert fake_osm == []


async def test_favor_without_position_is_rejected(client, app_db, fake_osm):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor(status="accepted"))

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 400


async def test_service_down_gives_a_friendly_503(client, app_db, monkeypatch):
    await seed(app_db)

    async def broken(*args, **kwargs):
        raise places.PlacesUnavailable("timeout")

    monkeypatch.setattr(places, "fetch_overpass_elements", broken)
    monkeypatch.setattr(places, "fetch_photon_features", broken)
    monkeypatch.setattr(places, "default_cache", places.PlacesCache(ttl_seconds=60))
    monkeypatch.setattr(places, "name_cache", places.PlacesCache(ttl_seconds=60))

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 503
    assert "scrivi" in response.json()["detail"].lower()


async def test_list_still_being_prepared_says_to_retry_shortly(client, app_db, monkeypatch):
    await seed(app_db)

    async def pending(*args, **kwargs):
        raise places.PlacesPending("in preparazione")

    async def photon_down(*args):
        raise places.PlacesUnavailable("down")

    monkeypatch.setattr(places, "search", pending)
    monkeypatch.setattr(places, "fetch_photon_features", photon_down)
    monkeypatch.setattr(places, "name_cache", places.PlacesCache(ttl_seconds=60))

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 503
    assert "riprova" in response.json()["detail"].lower()


# ---------- preparazione in anticipo alla pubblicazione ----------

async def test_publishing_a_favor_prepares_the_places_of_its_area(client, app_db, monkeypatch):
    monkeypatch.setenv("PLACES_WARM_ENABLED", "1")
    await app_db.users.insert_one(make_user("u1"))
    warmed = []

    async def fake_warm(lat, lon, **kwargs):
        warmed.append((round(lat, 3), round(lon, 3)))

    monkeypatch.setattr(places, "warm", fake_warm)
    payload = {
        "type": "offer", "title": "Aiuto con la spesa", "description": "Porto la spesa a casa",
        "category": "Spesa", "duration_hours": 1, "latitude": 37.93, "longitude": 12.33,
    }

    response = await client.post("/api/favors", json=payload, headers=auth("u1"))
    await asyncio.sleep(0.05)  # il lavoro parte in sottofondo

    assert response.status_code == 200
    assert len(warmed) == 1
    # a OpenStreetMap va la posizione approssimata già salvata, non quella esatta
    stored = await app_db.favors.find_one({"creator_id": "u1"})
    assert warmed[0] == (round(stored["approximate_latitude"], 3), round(stored["approximate_longitude"], 3))


async def test_publishing_still_works_when_preparation_fails(client, app_db, monkeypatch):
    monkeypatch.setenv("PLACES_WARM_ENABLED", "1")
    await app_db.users.insert_one(make_user("u1"))

    async def failing_warm(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(places, "warm", failing_warm)
    payload = {
        "type": "offer", "title": "Aiuto", "description": "Porto la spesa", "category": "Spesa",
        "duration_hours": 1, "latitude": 37.93, "longitude": 12.33,
    }

    response = await client.post("/api/favors", json=payload, headers=auth("u1"))
    await asyncio.sleep(0.05)

    assert response.status_code == 200


async def test_category_falls_back_to_name_search_when_overpass_is_down(client, app_db, fake_osm, monkeypatch):
    await seed(app_db)

    async def overpass_down(lat, lon, radius_m):
        raise places.PlacesUnavailable("502")

    async def photon(lat, lon, text):
        return [
            photon_feature(20, "Farmacia Alberti", 37.9320, 12.3310, value="pharmacy"),
            photon_feature(21, "Bar Roma Nuovo", 37.9322, 12.3310),
        ]

    monkeypatch.setattr(places, "fetch_overpass_elements", overpass_down)
    monkeypatch.setattr(places, "fetch_photon_features", photon)

    response = await client.get("/api/favors/favor_1/places", params={"q": "farmacia"}, headers=auth("creator"))

    assert response.status_code == 200
    assert [p["name"] for p in response.json()["places"]] == ["Farmacia Alberti"]


async def test_category_still_fails_clearly_when_both_services_are_down(client, app_db, fake_osm, monkeypatch):
    await seed(app_db)

    async def down(*args):
        raise places.PlacesUnavailable("down")

    monkeypatch.setattr(places, "fetch_overpass_elements", down)
    monkeypatch.setattr(places, "fetch_photon_features", down)

    response = await client.get("/api/favors/favor_1/places", params={"category": "pharmacy"}, headers=auth("creator"))

    assert response.status_code == 503
