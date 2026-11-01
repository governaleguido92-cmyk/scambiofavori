"""Ricerca di luoghi pubblici vicino al favore (OpenStreetMap): logica e rotta."""
import pytest

import places
from conftest import auth, make_favor, make_user

CENTER = (37.931, 12.331)


def osm_node(osm_id, name, lat, lon, **tags):
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": {"name": name, **tags}}


def osm_way(osm_id, name, lat, lon, **tags):
    return {"type": "way", "id": osm_id, "center": {"lat": lat, "lon": lon}, "tags": {"name": name, **tags}}


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


def test_query_uses_rounded_center_radius_and_category_tags():
    query = places.build_query(37.931, 12.331, "pharmacy", 1000)

    assert "around:1000,37.931,12.331" in query
    assert '"amenity"~"^pharmacy$"' in query
    assert "out center" in query


def test_unknown_category_is_rejected():
    with pytest.raises(ValueError):
        places.build_query(37.931, 12.331, "casinò", 1000)
    with pytest.raises(ValueError):
        places.build_query(37.931, 12.331, None, 1000)


def test_parse_orders_by_distance_and_skips_unnamed_places():
    elements = [
        osm_node(1, "Bar Lontano", 37.940, 12.331),
        osm_node(2, "Bar Vicino", 37.9312, 12.331),
        {"type": "node", "id": 3, "lat": 37.9311, "lon": 12.331, "tags": {"amenity": "bar"}},  # senza nome
    ]

    result = places.parse_places(elements, *CENTER, "bar", limit=10)

    assert [p["name"] for p in result] == ["Bar Vicino", "Bar Lontano"]
    assert all(p["category"] == "bar" for p in result)
    assert result[0]["distance_m"] < result[1]["distance_m"]


def test_parse_uses_center_of_ways_and_builds_street():
    elements = [osm_way(5, "Farmacia Centrale", 37.9315, 12.3312, **{"addr:street": "Via Roma", "addr:housenumber": "12"})]

    [place] = places.parse_places(elements, *CENTER, "pharmacy", limit=10)

    assert place["street"] == "Via Roma 12"
    assert isinstance(place["distance_m"], int)


def test_parse_merges_duplicates_of_the_same_place():
    # lo stesso locale può comparire come punto e come edificio
    elements = [osm_node(1, "Bar Roma", 37.9312, 12.3310), osm_way(2, "Bar Roma", 37.93121, 12.33101)]

    result = places.parse_places(elements, *CENTER, "bar", limit=10)

    assert len(result) == 1


def test_parse_respects_the_limit():
    elements = [osm_node(i, f"Bar {i}", 37.931 + i * 0.0001, 12.331) for i in range(1, 30)]

    assert len(places.parse_places(elements, *CENTER, "bar", limit=5)) == 5


def test_parse_ignores_malformed_elements():
    elements = [{"type": "node", "id": 1}, {"tags": {"name": "Senza coordinate"}}, "non un dizionario", osm_node(2, "Bar Ok", 37.9312, 12.331)]

    result = places.parse_places(elements, *CENTER, "bar", limit=10)

    assert [p["name"] for p in result] == ["Bar Ok"]


def photon_feature(osm_id, name, lat, lon, key="amenity", value="cafe", **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"osm_type": "N", "osm_id": osm_id, "name": name, "osm_key": key, "osm_value": value, **props},
    }


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


async def test_name_search_is_cached_and_ignores_case():
    calls = []

    async def fake_photon(lat, lon, text):
        calls.append(text)
        return [photon_feature(1, "Bar Roma", 37.9312, 12.331)]

    cache = places.PlacesCache(ttl_seconds=60, clock=lambda: 0.0)

    first = await places.search_by_name(37.931, 12.331, "Bar Roma", fetch=fake_photon, cache=cache)
    again = await places.search_by_name(37.931, 12.331, "  bar roma ", fetch=fake_photon, cache=cache)

    assert first == again
    assert len(calls) == 1


async def test_results_are_cached_per_area_and_category():
    calls = []

    async def fake_fetch(lat, lon, category, radius_m):
        calls.append((lat, lon, category))
        return [osm_node(1, "Bar Roma", 37.9312, 12.331)]

    cache = places.PlacesCache(ttl_seconds=60, clock=lambda: 1000.0)

    first = await places.search(37.931, 12.331, "bar", 1000, fetch=fake_fetch, cache=cache)
    second = await places.search(37.931, 12.331, "bar", 1000, fetch=fake_fetch, cache=cache)
    other = await places.search(37.931, 12.331, "park", 1000, fetch=fake_fetch, cache=cache)

    assert first == second
    assert len(calls) == 2  # la seconda ricerca uguale è servita dalla copia
    assert other is not None


async def test_cache_expires():
    now = {"t": 0.0}
    calls = []

    async def fake_fetch(lat, lon, category, radius_m):
        calls.append(1)
        return []

    cache = places.PlacesCache(ttl_seconds=60, clock=lambda: now["t"])

    await places.search(37.931, 12.331, "bar", 1000, fetch=fake_fetch, cache=cache)
    now["t"] = 61.0
    await places.search(37.931, 12.331, "bar", 1000, fetch=fake_fetch, cache=cache)

    assert len(calls) == 2


async def test_failed_fetch_is_not_cached():
    attempts = []

    async def flaky_fetch(lat, lon, category, radius_m):
        attempts.append(1)
        if len(attempts) == 1:
            raise places.PlacesUnavailable("giù")
        return [osm_node(1, "Bar Roma", 37.9312, 12.331)]

    cache = places.PlacesCache(ttl_seconds=60, clock=lambda: 0.0)

    with pytest.raises(places.PlacesUnavailable):
        await places.search(37.931, 12.331, "bar", 1000, fetch=flaky_fetch, cache=cache)
    retry = await places.search(37.931, 12.331, "bar", 1000, fetch=flaky_fetch, cache=cache)

    assert len(retry) == 1


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
    """Sostituisce la chiamata a OpenStreetMap e registra con cosa è stata chiamata."""
    calls = []
    data = {
        "bar": [osm_node(1, "Bar Roma", 37.9318, 12.3312), osm_node(2, "Caffè Centrale", 37.9330, 12.3300)],
        "pharmacy": [osm_node(3, "Farmacia Sole", 37.9320, 12.3310)],
    }

    async def fake_fetch(lat, lon, category, radius_m):
        calls.append({"lat": lat, "lon": lon, "category": category, "radius": radius_m})
        if category is None:
            return [element for group in data.values() for element in group]
        return data.get(category, [])

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
    assert fake_osm[0]["category"] == "pharmacy"


async def test_other_text_searches_by_name_near_the_favor(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"q": "roma"}, headers=auth("creator"))

    # "Roma Bar" è a più di 100 km: scartato. Il centro è la posizione approssimata arrotondata.
    assert [p["name"] for p in response.json()["places"]] == ["Pizzeria Roma", "Bar Roma Nuovo"]
    assert fake_osm[0]["category"] is None
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
    assert fake_osm[0]["lat"] != 37.9000


async def test_only_participants_can_search(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("stranger"))

    assert response.status_code == 403
    assert fake_osm == []


async def test_requires_login(client, app_db, fake_osm):
    await seed(app_db)

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"})

    assert response.status_code == 401


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

    response = await client.get("/api/favors/favor_1/places", params={"category": "bar"}, headers=auth("creator"))

    assert response.status_code == 503
    assert "scrivi" in response.json()["detail"].lower()
