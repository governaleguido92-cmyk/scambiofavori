"""Favor locations shown to other users must be genuinely approximate."""
import math

import core

SAMPLES = 2000
LAT, LON = 37.93, 12.33  # Favignana


def _distance_m(lat1, lon1, lat2, lon2):
    return core.calculate_distance(lat1, lon1, lat2, lon2) * 1000


def test_privacy_radius_is_at_least_500_meters():
    assert core.PRIVACY_RADIUS_METERS >= 500


def test_approximate_location_stays_within_privacy_radius():
    for _ in range(SAMPLES):
        lat, lon = core.approximate_location(LAT, LON)
        assert _distance_m(LAT, LON, lat, lon) <= core.PRIVACY_RADIUS_METERS * 1.01


def test_approximate_location_is_never_close_to_the_real_point():
    minimum = core.PRIVACY_RADIUS_METERS * 0.3 * 0.99
    for _ in range(SAMPLES):
        lat, lon = core.approximate_location(LAT, LON)
        assert _distance_m(LAT, LON, lat, lon) >= minimum
