"""Luoghi per eventi e avvisi del quartiere: fino a 20 km dalla posizione di chi organizza, con spiagge e porti."""
import pytest

import places
from conftest import auth, make_user

PLACES_URL = "/api/neighborhood/places"
CENTER = (37.931, 12.331)


def node(osm_id, name, lat, lon, **tags):
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": {"name": name, **tags}}


def km_north(km):
    return CENTER[0] + km / 111.0


async def user_with_position(app_db, user_id="marco"):
    await app_db.users.insert_one(make_user(user_id, approximate_latitude=CENTER[0], approximate_longitude=CENTER[1]))


@pytest.fixture
def area(monkeypatch):
    """Sostituisce la ricerca su OpenStreetMap con un elenco fisso, ricordando cosa è stato chiesto."""
    asked = {}
    elements = [
        node(1, "Piazza Madrice", km_north(0.4), CENTER[1], place="square"),
        node(2, "Bar Sole", km_north(2), CENTER[1], amenity="cafe"),
        node(3, "Cala Rossa", km_north(12), CENTER[1], natural="beach"),
        node(4, "Porto di Favignana", km_north(18), CENTER[1], leisure="marina"),
        node(5, "Bar Lontano", km_north(40), CENTER[1], amenity="bar"),
    ]

    async def fake_nearby(lat, lon, category, **kwargs):
        asked["category"] = category
        found = places.parse_places(elements, lat, lon, None, limit=100)
        return [p for p in found if p["category"] == category and p["distance_m"] <= places.NEIGHBORHOOD_RADIUS_M]

    monkeypatch.setattr(places, "search_category_nearby", fake_nearby)  # la rotta passa da search_category_neighborhood
    return asked


def test_beach_and_harbour_are_recognised_from_osm_tags():
    [beach] = places.parse_places([node(1, "Cala Azzurra", 37.93, 12.33, natural="beach")], *CENTER, None, limit=5)
    [harbour] = places.parse_places([node(2, "Marina", 37.93, 12.33, leisure="marina")], *CENTER, None, limit=5)
    assert beach["category"] == "beach" and harbour["category"] == "harbour"
    assert places.resolve_category("spiaggia") == "beach" and places.resolve_category("porto") == "harbour"


async def test_needs_login(client):
    assert (await client.get(PLACES_URL, params={"category": "bar"})).status_code == 401


async def test_lists_places_within_20_km_nearest_first(client, app_db, area):
    await user_with_position(app_db)

    response = await client.get(PLACES_URL, params={"category": "beach"}, headers=auth("marco"))

    assert response.status_code == 200
    assert area["category"] == "beach"
    assert [p["name"] for p in response.json()["places"]] == ["Cala Rossa"]
    assert response.json()["radius_km"] == 20


async def test_far_places_are_left_out(client, app_db, area):
    await user_with_position(app_db)

    response = await client.get(PLACES_URL, params={"category": "bar"}, headers=auth("marco"))

    assert [p["name"] for p in response.json()["places"]] == ["Bar Sole"]  # «Bar Lontano» è a 40 km


async def test_a_word_picks_the_category_and_other_text_filters_by_name(client, app_db, area):
    await user_with_position(app_db)

    by_word = await client.get(PLACES_URL, params={"q": "porto"}, headers=auth("marco"))
    by_name = await client.get(PLACES_URL, params={"category": "bar", "q": "sole"}, headers=auth("marco"))

    assert [p["name"] for p in by_word.json()["places"]] == ["Porto di Favignana"]
    assert [p["name"] for p in by_name.json()["places"]] == ["Bar Sole"]


async def test_free_text_searches_by_name_up_to_20_km(client, app_db, monkeypatch):
    await user_with_position(app_db)
    seen = {}

    async def fake_by_name(lat, lon, text, max_distance_m=places.NAME_SEARCH_RADIUS_M, **kwargs):
        seen["max"] = max_distance_m
        return [{"id": "node/9", "name": "Cantina Sociale", "category": "other", "distance_m": 9000, "street": None}]

    monkeypatch.setattr(places, "search_by_name", fake_by_name)

    response = await client.get(PLACES_URL, params={"q": "cantina"}, headers=auth("marco"))

    assert seen["max"] == 20000
    assert response.json()["places"][0]["name"] == "Cantina Sociale"


@pytest.mark.parametrize("params,status", [({}, 400), ({"category": "casinò"}, 400), ({"q": "x" * 41}, 400)])
async def test_invalid_requests_are_refused(client, app_db, area, params, status):
    await user_with_position(app_db)
    assert (await client.get(PLACES_URL, params=params, headers=auth("marco"))).status_code == status


async def test_without_any_position_it_says_so(client, app_db, area):
    await app_db.users.insert_one(make_user("nuovo"))
    response = await client.get(PLACES_URL, params={"category": "bar"}, headers=auth("nuovo"))
    assert response.status_code == 403 and "posizione" in response.json()["detail"]


async def test_service_trouble_is_reported_without_details(client, app_db, monkeypatch):
    await user_with_position(app_db)

    async def pending(*args, **kwargs):
        raise places.PlacesPending("in preparazione")

    async def down(*args, **kwargs):
        raise places.PlacesUnavailable("giù")

    monkeypatch.setattr(places, "search_category_nearby", pending)
    monkeypatch.setattr(places, "search_by_name", down)  # niente rete nei test: anche il ripiego è fuori uso

    response = await client.get(PLACES_URL, params={"category": "bar"}, headers=auth("marco"))

    assert response.status_code == 503 and "riprova" in response.json()["detail"]


class MemoryCache:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)

    async def set(self, key, value):
        self.data[key] = value


async def test_nearby_search_stops_at_5_km_when_there_are_enough_places():
    calls = []

    async def fetch(lat, lon, radius_m, category):
        calls.append(radius_m)
        return [node(i, f"Bar {i}", km_north(0.2 * i), CENTER[1], amenity="cafe") for i in range(1, 9)]

    found = await places.search_category_nearby(*CENTER, "bar", fetch=fetch, cache=MemoryCache())

    assert calls == [5000] and len(found) == 8


async def test_nearby_search_widens_to_20_km_only_when_few_places_are_close():
    calls = []

    async def fetch(lat, lon, radius_m, category):
        calls.append(radius_m)
        near = [node(1, "Cala Vicina", km_north(1), CENTER[1], natural="beach")]
        far = [node(2, "Cala Lontana", km_north(15), CENTER[1], natural="beach")]
        return near if radius_m == 5000 else near + far

    found = await places.search_category_nearby(*CENTER, "beach", fetch=fetch, cache=MemoryCache())

    assert calls == [5000, 20000]
    assert [p["name"] for p in found] == ["Cala Vicina", "Cala Lontana"]


async def test_nearby_search_uses_a_copy_the_second_time():
    calls = []

    async def fetch(lat, lon, radius_m, category):
        calls.append(radius_m)
        return [node(1, "Bar Sole", km_north(1), CENTER[1], amenity="bar")]

    cache = MemoryCache()
    await places.search_category_nearby(*CENTER, "bar", fetch=fetch, cache=cache)
    calls.clear()
    await places.search_category_nearby(*CENTER, "bar", fetch=fetch, cache=cache)

    assert calls == []


def test_a_single_category_query_is_lighter_than_the_full_one():
    one = places.build_query(*CENTER, 20000, only_category="beach")
    everything = places.build_query(*CENTER, 20000)
    assert '"natural"' in one and '"amenity"' not in one
    assert len(one) < len(everything) / 3


async def test_when_overpass_is_busy_the_name_search_fills_in(monkeypatch):
    async def busy(*args, **kwargs):
        raise places.PlacesUnavailable("502")

    async def by_name(lat, lon, text, max_distance_m=places.NAME_SEARCH_RADIUS_M, **kwargs):
        assert max_distance_m == 20000
        return [
            {"id": "node/1", "name": "Spiaggia del Bue Marino", "category": "beach", "distance_m": 4000, "street": None},
            {"id": "node/2", "name": "Bar Spiaggia", "category": "bar", "distance_m": 500, "street": None},
        ]

    monkeypatch.setattr(places, "search_category_nearby", busy)
    monkeypatch.setattr(places, "search_by_name", by_name)

    found = await places.search_category_neighborhood(*CENTER, "beach")

    assert [p["name"] for p in found] == ["Spiaggia del Bue Marino"]  # il bar con «spiaggia» nel nome non è una spiaggia


async def test_when_both_services_fail_the_original_error_is_raised(monkeypatch):
    async def busy(*args, **kwargs):
        raise places.PlacesPending("in preparazione")

    async def down(*args, **kwargs):
        raise places.PlacesUnavailable("giù")

    monkeypatch.setattr(places, "search_category_nearby", busy)
    monkeypatch.setattr(places, "search_by_name", down)

    with pytest.raises(places.PlacesPending):
        await places.search_category_neighborhood(*CENTER, "beach")
