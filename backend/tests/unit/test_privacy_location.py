"""Favor locations shown to other users must be genuinely approximate."""
import math

import core

SAMPLES = 2000
LAT, LON = 37.93, 12.33  # Favignana


def _distance_m(lat1, lon1, lat2, lon2):
    return core.calculate_distance(lat1, lon1, lat2, lon2) * 1000


def test_other_users_see_a_position_between_100_and_300_meters_away():
    for _ in range(SAMPLES):
        lat, lon = core.approximate_location(LAT, LON)
        distance = _distance_m(LAT, LON, lat, lon)
        assert 100 * 0.99 <= distance <= 300 * 1.01


def test_privacy_radius_is_at_least_300_meters():
    assert core.PRIVACY_RADIUS_METERS >= 300


def test_approximate_location_stays_within_privacy_radius():
    for _ in range(SAMPLES):
        lat, lon = core.approximate_location(LAT, LON)
        assert _distance_m(LAT, LON, lat, lon) <= core.PRIVACY_RADIUS_METERS * 1.01


def test_approximate_location_is_never_close_to_the_real_point():
    minimum = core.PRIVACY_RADIUS_METERS * core.PRIVACY_MIN_OFFSET_RATIO * 0.99
    assert minimum >= 100 * 0.99
    for _ in range(SAMPLES):
        lat, lon = core.approximate_location(LAT, LON)
        assert _distance_m(LAT, LON, lat, lon) >= minimum


def test_same_user_always_gets_the_same_offset():
    first = core.approximate_location(LAT, LON, seed="user_a")
    for _ in range(50):
        assert core.approximate_location(LAT, LON, seed="user_a") == first


def test_different_users_get_different_offsets():
    points = {core.approximate_location(LAT, LON, seed=f"user_{i}") for i in range(20)}
    assert len(points) > 15


def test_seeded_offset_stays_in_the_privacy_band():
    minimum = core.PRIVACY_RADIUS_METERS * core.PRIVACY_MIN_OFFSET_RATIO * 0.99
    for i in range(300):
        lat, lon = core.approximate_location(LAT, LON, seed=f"user_{i}")
        distance = _distance_m(LAT, LON, lat, lon)
        assert minimum <= distance <= core.PRIVACY_RADIUS_METERS * 1.01
