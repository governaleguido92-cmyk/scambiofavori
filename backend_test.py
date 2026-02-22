#!/usr/bin/env python3
"""
Backend Testing for Scambio di Favori API - NEW FEATURES
Focused testing on the new features: Proximity Check, Gamification, Solidarity Fund Access Control, and Privacy Layer
"""

import asyncio
import httpx
import json
import os
import sys
import math
from datetime import datetime
from typing import Dict, Any, Optional

# Get the backend URL from environment  
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://kindness-hub-13.preview.emergentagent.com')
API_BASE_URL = f"{BACKEND_URL}/api"

class NewFeaturesAPITester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.auth_token = None
        self.test_user_id = None
        self.created_favor_id = None
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
        
        # Test locations for proximity testing (Rome coordinates)
        self.colosseum = {"latitude": 41.8902, "longitude": 12.4922}
        self.vatican = {"latitude": 41.9029, "longitude": 12.4534}  # ~4km from Colosseum
        self.pantheon = {"latitude": 41.8986, "longitude": 12.4769}  # ~300m from Colosseum

    def calculate_distance_meters(self, lat1, lon1, lat2, lon2):
        """Calculate distance in meters using Haversine formula"""
        R = 6371000  # Earth's radius in meters
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c

    async def log_result(self, test_name: str, success: bool, details: str = ""):
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"    {details}")
        
        if success:
            self.results["passed"] += 1
        else:
            self.results["failed"] += 1
            self.results["errors"].append(f"{test_name}: {details}")

    async def make_request(self, method: str, endpoint: str, data: dict = None, headers: dict = None) -> tuple[bool, dict]:
        """Make HTTP request and return (success, response_data)"""
        try:
            url = f"{API_BASE_URL}{endpoint}"
            request_headers = headers or {}
            
            if self.auth_token:
                request_headers["Authorization"] = f"Bearer {self.auth_token}"
            
            if method.upper() == "GET":
                response = await self.client.get(url, headers=request_headers, params=data)
            elif method.upper() == "POST":
                response = await self.client.post(url, json=data, headers=request_headers)
            elif method.upper() == "DELETE":
                response = await self.client.delete(url, headers=request_headers)
            else:
                return False, {"error": f"Unsupported method: {method}"}
            
            if response.status_code in [200, 201]:
                return True, response.json()
            else:
                return False, {
                    "status_code": response.status_code,
                    "error": response.text,
                    "response_json": response.json() if response.headers.get("content-type", "").startswith("application/json") else None
                }
        except Exception as e:
            return False, {"error": str(e), "url": f"{API_BASE_URL}{endpoint}"}

    # ======================== SETUP TESTS ========================

    async def setup_test_user(self):
        """Register a new test user"""
        test_user = {
            "email": f"newfeatures_{datetime.now().microsecond}@scambiodifavori.com",
            "name": "Test User New Features",
            "password": "testpassword123"
        }
        
        success, response = await self.make_request("POST", "/auth/register", test_user)
        
        if success and "user" in response and "token" in response:
            self.auth_token = response["token"]
            self.test_user_id = response["user"]["user_id"]
            user_soli = response["user"].get("soli", 0)
            
            await self.log_result("Setup Test User", True, 
                f"User created with {user_soli} Soli, ID: {self.test_user_id}")
            return True
        else:
            await self.log_result("Setup Test User", False, 
                f"Registration failed: {response}")
            return False

    # ======================== NEW FEATURES TESTS ========================

    async def test_1_eroe_quartiere_badge_exists(self):
        """Test 1: Check /api/badges for 'eroe_quartiere' badge"""
        success, response = await self.make_request("GET", "/badges")
        
        if success and isinstance(response, list):
            eroe_badge = next((b for b in response if b.get('id') == 'eroe_quartiere'), None)
            
            if eroe_badge:
                # Check required properties
                required_props = ['id', 'name', 'description', 'icon', 'color']
                has_all_props = all(prop in eroe_badge for prop in required_props)
                
                # Check if description mentions Solidarity Fund
                description = eroe_badge.get('description', '')
                mentions_fund = 'Fondo Solidarietà' in description or 'Solidarity' in description
                
                if has_all_props and mentions_fund:
                    await self.log_result("1. Eroe Quartiere Badge Check", True, 
                        f"Badge found: '{eroe_badge['name']}' - {eroe_badge['description']}")
                    return True
                else:
                    await self.log_result("1. Eroe Quartiere Badge Check", False, 
                        f"Badge missing properties or fund mention. Badge: {eroe_badge}")
                    return False
            else:
                await self.log_result("1. Eroe Quartiere Badge Check", False, 
                    f"Badge 'eroe_quartiere' not found in {len(response)} badges")
                return False
        else:
            await self.log_result("1. Eroe Quartiere Badge Check", False, 
                f"Failed to get badges: {response}")
            return False

    async def test_2_solidarity_fund_access_denied(self):
        """Test 2: Try to donate to solidarity fund (should fail - no access yet)"""
        donation_data = {
            "amount": 5,
            "message": "Test donation to solidarity fund"
            # No recipient_id means donation to solidarity fund
        }
        
        success, response = await self.make_request("POST", "/donations", donation_data)
        
        if not success and response.get("status_code") == 403:
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            # Should mention completing more favors
            if ('Completa ancora' in error_msg or 'favori' in error_msg) and 'sbloccare' in error_msg:
                await self.log_result("2. Solidarity Fund Access Denied", True, 
                    f"Correctly blocked: {error_msg}")
                return True
            else:
                await self.log_result("2. Solidarity Fund Access Denied", False, 
                    f"Wrong error message: {error_msg}")
                return False
        else:
            await self.log_result("2. Solidarity Fund Access Denied", False, 
                f"Expected 403 error, got: {response}")
            return False

    async def test_3_privacy_layer_coordinates_blur(self):
        """Test 3: Privacy Layer (200m blur) - Check that exact coordinates are not exposed"""
        favor_data = {
            "type": "offer",
            "title": "Privacy Test Favor",
            "description": "Testing 200m location privacy blur",
            "category": "Aiuto Rapido",
            "duration_hours": 1.0,
            "latitude": self.colosseum["latitude"],
            "longitude": self.colosseum["longitude"],
            "is_micro": True
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if success and "favor_id" in response:
            # Check privacy implementation
            approx_lat = response.get('approximate_latitude')
            approx_lon = response.get('approximate_longitude')
            exact_lat = response.get('exact_latitude') 
            exact_lon = response.get('exact_longitude')
            
            # Should have approximate coordinates
            if approx_lat is None or approx_lon is None:
                await self.log_result("3. Privacy Layer Coordinates", False, 
                    "Missing approximate coordinates in response")
                return False
            
            # Should NOT expose exact coordinates in public API
            if exact_lat is not None or exact_lon is not None:
                await self.log_result("3. Privacy Layer Coordinates", False, 
                    "Exact coordinates exposed in public API response")
                return False
            
            # Check that blur distance is reasonable (within privacy radius)
            blur_distance = self.calculate_distance_meters(
                self.colosseum["latitude"], self.colosseum["longitude"],
                approx_lat, approx_lon
            )
            
            if blur_distance > 300:  # Allow some buffer beyond 200m
                await self.log_result("3. Privacy Layer Coordinates", False, 
                    f"Privacy blur too large: {int(blur_distance)}m > 300m")
                return False
            elif blur_distance < 10:  # Should have meaningful blur
                await self.log_result("3. Privacy Layer Coordinates", False, 
                    f"Privacy blur too small: {int(blur_distance)}m")
                return False
            else:
                await self.log_result("3. Privacy Layer Coordinates", True, 
                    f"Coordinates properly blurred by {int(blur_distance)}m (within 200m ± buffer)")
                self.created_favor_id = response["favor_id"]
                return True
        else:
            await self.log_result("3. Privacy Layer Coordinates", False, 
                f"Failed to create favor for privacy test: {response}")
            return False

    async def test_4_proximity_check_50m_limit(self):
        """Test 4: Proximity Check (50m limit) - Should fail when users are too far apart"""
        # Create a new favor specifically for proximity testing
        favor_data = {
            "type": "request",  # Request so current user can accept and complete
            "title": "Proximity Test Favor Request",
            "description": "Testing proximity check on completion",
            "category": "Aiuto Rapido",
            "duration_hours": 1.0,
            "latitude": self.colosseum["latitude"],
            "longitude": self.colosseum["longitude"],
            "is_micro": True
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if not success:
            await self.log_result("4. Proximity Check (50m limit)", False, 
                f"Could not create favor for test: {response}")
            return False
        
        favor_id = response["favor_id"]
        
        # Accept the favor first (required before completion)
        accept_data = {"favor_id": favor_id}
        success, response = await self.make_request("POST", "/favors/accept", accept_data)
        
        if not success:
            await self.log_result("4. Proximity Check (50m limit)", False, 
                f"Could not accept favor: {response}")
            return False
        
        # Now try to complete from Vatican (4km away from Colosseum) - should fail
        complete_data = {
            "favor_id": favor_id,
            "latitude": self.vatican["latitude"],
            "longitude": self.vatican["longitude"]
        }
        
        success, response = await self.make_request("POST", "/favors/complete", complete_data)
        
        if not success:
            status_code = response.get("status_code")
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            # Should be blocked for distance (400 error expected)
            if status_code == 400 and ('troppo lontani' in error_msg or 'distance' in error_msg.lower()):
                # Calculate actual distance to verify
                actual_distance = self.calculate_distance_meters(
                    self.colosseum["latitude"], self.colosseum["longitude"],
                    self.vatican["latitude"], self.vatican["longitude"]
                )
                
                await self.log_result("4. Proximity Check (50m limit)", True, 
                    f"Correctly blocked completion at {int(actual_distance)}m: {error_msg}")
                return True
            else:
                await self.log_result("4. Proximity Check (50m limit)", False, 
                    f"Wrong error response (Status: {status_code}): {error_msg}")
                return False
        else:
            await self.log_result("4. Proximity Check (50m limit)", False, 
                "Proximity check failed - completion allowed at 4km distance")
            return False

    async def test_5_check_privacy_radius_constant(self):
        """Test 5: Verify PRIVACY_RADIUS_METERS = 200 by checking server configuration"""
        # We can't directly access server constants, but we can infer from behavior
        # Create multiple favors and check consistency of blur radius
        
        test_locations = [
            {"lat": 41.8902, "lon": 12.4922, "name": "Colosseum"},
            {"lat": 41.9029, "lon": 12.4534, "name": "Vatican"},
        ]
        
        blur_distances = []
        
        for i, location in enumerate(test_locations):
            favor_data = {
                "type": "offer", 
                "title": f"Privacy Test {i+1}",
                "description": f"Testing privacy at {location['name']}",
                "category": "Aiuto Rapido",
                "duration_hours": 1.0,
                "latitude": location["lat"],
                "longitude": location["lon"],
                "is_micro": True
            }
            
            success, response = await self.make_request("POST", "/favors", favor_data)
            
            if success:
                approx_lat = response.get('approximate_latitude')
                approx_lon = response.get('approximate_longitude')
                
                if approx_lat and approx_lon:
                    blur_distance = self.calculate_distance_meters(
                        location["lat"], location["lon"], approx_lat, approx_lon
                    )
                    blur_distances.append(blur_distance)
        
        if len(blur_distances) >= 2:
            avg_blur = sum(blur_distances) / len(blur_distances)
            max_blur = max(blur_distances)
            
            # Check that blur distances are within expected 200m radius
            if max_blur <= 250 and avg_blur <= 200:  # Allow some variance
                await self.log_result("5. Privacy Radius Verification", True, 
                    f"Privacy radius consistent: avg {int(avg_blur)}m, max {int(max_blur)}m (≤200m expected)")
                return True
            else:
                await self.log_result("5. Privacy Radius Verification", False, 
                    f"Privacy radius too large: avg {int(avg_blur)}m, max {int(max_blur)}m")
                return False
        else:
            await self.log_result("5. Privacy Radius Verification", False, 
                "Could not create enough test favors to verify privacy radius")
            return False

    async def test_6_gamification_badge_requirements(self):
        """Test 6: Check that Eroe di Quartiere badge requires 5 completed favors"""
        # Get current user info to check badges
        success, response = await self.make_request("GET", "/auth/me")
        
        if success:
            user_badges = response.get("badges", [])
            total_favors_given = response.get("total_favors_given", 0)
            total_favors_received = response.get("total_favors_received", 0)
            total_favors = total_favors_given + total_favors_received
            
            has_eroe_badge = "eroe_quartiere" in user_badges
            
            if total_favors < 5 and not has_eroe_badge:
                await self.log_result("6. Gamification Badge Requirements", True, 
                    f"User correctly has NO 'eroe_quartiere' badge (only {total_favors}/5 favors completed)")
                return True
            elif total_favors >= 5 and has_eroe_badge:
                await self.log_result("6. Gamification Badge Requirements", True, 
                    f"User correctly has 'eroe_quartiere' badge ({total_favors}/5 favors completed)")
                return True
            elif total_favors >= 5 and not has_eroe_badge:
                await self.log_result("6. Gamification Badge Requirements", False, 
                    f"User should have 'eroe_quartiere' badge ({total_favors}/5 favors completed)")
                return False
            else:
                await self.log_result("6. Gamification Badge Requirements", False, 
                    f"User incorrectly has badge with only {total_favors}/5 favors")
                return False
        else:
            await self.log_result("6. Gamification Badge Requirements", False, 
                f"Failed to get user info: {response}")
            return False

    # ======================== MAIN TEST RUNNER ========================

    async def run_new_features_tests(self):
        """Run all new feature tests in sequence"""
        print("🚀 Testing NEW FEATURES - Scambio di Favori Backend")
        print(f"📡 API Base URL: {API_BASE_URL}")
        print("=" * 70)

        # Setup
        if not await self.setup_test_user():
            print("❌ Cannot proceed without test user")
            return False

        # Test the new features
        print("\n🧪 TESTING NEW FEATURES:")
        await self.test_1_eroe_quartiere_badge_exists()
        await self.test_2_solidarity_fund_access_denied()
        await self.test_3_privacy_layer_coordinates_blur()
        await self.test_4_proximity_check_50m_limit()
        await self.test_5_check_privacy_radius_constant()
        await self.test_6_gamification_badge_requirements()

        # Summary
        print("\n" + "=" * 70)
        print("📊 NEW FEATURES TEST SUMMARY")
        print("=" * 70)
        
        total_tests = len(self.results['errors']) + self.results['passed']
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        
        if self.results['errors']:
            print("\n🚨 FAILED TESTS:")
            for error in self.results['errors']:
                print(f"   • {error}")
        
        await self.client.aclose()
        return self.results['failed'] == 0

async def main():
    """Main entry point"""
    tester = NewFeaturesAPITester()
    
    try:
        success = await tester.run_new_features_tests()
        
        if success:
            print("\n🎉 ALL NEW FEATURES TESTS PASSED!")
            sys.exit(0)
        else:
            print("\n⚠️ SOME NEW FEATURES TESTS FAILED")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n💥 Testing failed with error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())