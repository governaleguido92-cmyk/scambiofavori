#!/usr/bin/env python3
"""
Backend Testing for Optimized "Scambio di Favori" API
Testing NEW optimized features:
1. Currency renamed to "GRANELLI" 💎
2. Geofencing 100 meters (changed from 50m)
3. Social Impact Score
4. Ethical Tags for Reviews
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

class OptimizedFeaturesAPITester:
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
        
        # Test locations for geofencing (Rome coordinates)
        self.colosseum = {"latitude": 41.8902, "longitude": 12.4922}
        self.vatican = {"latitude": 41.9029, "longitude": 12.4534}  # ~4km from Colosseum
        self.nearby_location = {"latitude": 41.8903, "longitude": 12.4923}  # ~80m from Colosseum

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

    # ======================== SETUP ========================

    async def setup_test_user(self):
        """Register a new test user"""
        test_user = {
            "email": f"optimized_{datetime.now().microsecond}@scambiodifavori.com",
            "name": "Giulia Bianchi",  # Real looking Italian name
            "password": "Ciao2026!"
        }
        
        success, response = await self.make_request("POST", "/auth/register", test_user)
        
        if success and "user" in response and "token" in response:
            self.auth_token = response["token"]
            self.test_user_id = response["user"]["user_id"]
            user_granelli = response["user"].get("granelli", 0)
            
            await self.log_result("Setup Test User", True, 
                f"User Giulia created with {user_granelli} Granelli, ID: {self.test_user_id}")
            return True
        else:
            await self.log_result("Setup Test User", False, 
                f"Registration failed: {response}")
            return False

    # ======================== TEST CURRENCY RENAMED TO GRANELLI ========================

    async def test_1_currency_info_granelli(self):
        """Test 1: GET /api/currency should return 'Granelli' as currency name"""
        success, response = await self.make_request("GET", "/currency")
        
        if success:
            currency_name = response.get("name", "")
            currency_symbol = response.get("symbol", "")
            welcome_bonus = response.get("welcome_bonus", 0)
            
            # Check for "Granelli"
            if currency_name == "Granelli":
                if currency_symbol == "💎":
                    await self.log_result("1. Currency Info - Granelli", True, 
                        f"Currency correctly named '{currency_name}' with symbol '{currency_symbol}', welcome bonus: {welcome_bonus}")
                    return True
                else:
                    await self.log_result("1. Currency Info - Granelli", False, 
                        f"Currency name correct but wrong symbol: '{currency_symbol}' (expected '💎')")
                    return False
            else:
                await self.log_result("1. Currency Info - Granelli", False, 
                    f"Wrong currency name: '{currency_name}' (expected 'Granelli')")
                return False
        else:
            await self.log_result("1. Currency Info - Granelli", False, 
                f"Failed to get currency info: {response}")
            return False

    async def test_2_new_user_granelli_bonus(self):
        """Test 2: New users should receive 3 Granelli (not 10)"""
        # Get current user info
        success, response = await self.make_request("GET", "/auth/me")
        
        if success:
            granelli = response.get("granelli", 0)
            
            if granelli == 3:
                await self.log_result("2. New User Granelli Bonus", True, 
                    f"New user correctly has 3 Granelli (not 10)")
                return True
            else:
                await self.log_result("2. New User Granelli Bonus", False, 
                    f"New user has {granelli} Granelli (expected 3)")
                return False
        else:
            await self.log_result("2. New User Granelli Bonus", False, 
                f"Failed to get user info: {response}")
            return False

    # ======================== TEST GEOFENCING 100 METERS ========================

    async def test_3_geofencing_100m_fail(self):
        """Test 3: POST /api/favors/complete should fail if distance > 100m with '100m' in error"""
        # Create a favor to test geofencing
        favor_data = {
            "type": "request",  # Request so current user can accept and complete
            "title": "Aiuto con la spesa al Colosseo",
            "description": "Ho bisogno di aiuto per portare borse pesanti",
            "category": "Spesa",
            "duration_hours": 1.0,
            "latitude": self.colosseum["latitude"],
            "longitude": self.colosseum["longitude"]
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if not success:
            await self.log_result("3. Geofencing 100m - Setup", False, 
                f"Could not create favor for test: {response}")
            return False
        
        favor_id = response["favor_id"]
        
        # Accept the favor first (required before completion)
        accept_data = {"favor_id": favor_id}
        success, response = await self.make_request("POST", "/favors/accept", accept_data)
        
        if not success:
            await self.log_result("3. Geofencing 100m - Setup", False, 
                f"Could not accept favor: {response}")
            return False
        
        # Now try to complete from Vatican (4km away) - should fail with 100m message
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
            
            # Should be blocked for distance with 100m in the message
            if status_code == 400 and ('100m' in error_msg or '100 m' in error_msg):
                actual_distance = self.calculate_distance_meters(
                    self.colosseum["latitude"], self.colosseum["longitude"],
                    self.vatican["latitude"], self.vatican["longitude"]
                )
                
                await self.log_result("3. Geofencing 100m Limit", True, 
                    f"Correctly blocked at {int(actual_distance)}m with message containing '100m': {error_msg}")
                return True
            else:
                await self.log_result("3. Geofencing 100m Limit", False, 
                    f"Wrong error message (Status: {status_code}). Expected '100m' in message, got: {error_msg}")
                return False
        else:
            await self.log_result("3. Geofencing 100m Limit", False, 
                "Geofencing failed - completion allowed at 4km distance")
            return False

    # ======================== TEST SOCIAL IMPACT SCORE ========================

    async def test_4_social_impact_score_field(self):
        """Test 4: GET /api/auth/me should return social_impact_score field"""
        success, response = await self.make_request("GET", "/auth/me")
        
        if success:
            if "social_impact_score" in response:
                social_impact_score = response["social_impact_score"]
                if isinstance(social_impact_score, (int, float)):
                    await self.log_result("4. Social Impact Score Field", True, 
                        f"User has social_impact_score field: {social_impact_score}")
                    return True
                else:
                    await self.log_result("4. Social Impact Score Field", False, 
                        f"social_impact_score is not a number: {social_impact_score}")
                    return False
            else:
                await self.log_result("4. Social Impact Score Field", False, 
                    "User profile missing 'social_impact_score' field")
                return False
        else:
            await self.log_result("4. Social Impact Score Field", False, 
                f"Failed to get user info: {response}")
            return False

    # ======================== TEST ETHICAL TAGS ========================

    async def test_5_ethical_tags_endpoint(self):
        """Test 5: GET /api/ethical-tags should return list of tags with expected content"""
        success, response = await self.make_request("GET", "/ethical-tags")
        
        if success and isinstance(response, list):
            # Check for expected tags
            expected_tags = ["educato", "pulito", "puntuale"]
            expected_labels = ["È stato molto educato", "Ha lasciato tutto pulito", "Puntuale e affidabile"]
            
            found_tags = [tag.get("id") for tag in response if "id" in tag]
            found_labels = [tag.get("label") for tag in response if "label" in tag]
            
            # Check we have at least 8 tags as mentioned in review request
            if len(response) >= 8:
                # Check for specific expected tags
                tags_found = all(tag in found_tags for tag in expected_tags)
                labels_found = all(any(expected in label for label in found_labels) for expected in expected_labels)
                
                if tags_found and labels_found:
                    await self.log_result("5. Ethical Tags Endpoint", True, 
                        f"Found {len(response)} ethical tags including expected ones: {expected_tags}")
                    return True
                else:
                    await self.log_result("5. Ethical Tags Endpoint", False, 
                        f"Missing expected tags or labels. Found tags: {found_tags[:5]}...")
                    return False
            else:
                await self.log_result("5. Ethical Tags Endpoint", False, 
                    f"Expected at least 8 tags, found only {len(response)}")
                return False
        else:
            await self.log_result("5. Ethical Tags Endpoint", False, 
                f"Failed to get ethical tags or invalid format: {response}")
            return False

    async def test_6_review_with_ethical_tags(self):
        """Test 6: POST /api/reviews can include ethical_tags array"""
        # First complete a favor to be able to review
        # Create and complete a simple favor
        favor_data = {
            "type": "offer",  
            "title": "Aiuto veloce con tecnologia",
            "description": "Posso aiutare con problemi del computer",
            "category": "Tecnologia",
            "duration_hours": 0.5,
            "latitude": self.colosseum["latitude"],
            "longitude": self.colosseum["longitude"],
            "is_micro": True
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        if not success:
            await self.log_result("6. Review with Ethical Tags - Setup", False, 
                f"Could not create favor: {response}")
            return False
        
        favor_id = response["favor_id"]
        
        # Accept the favor
        accept_data = {"favor_id": favor_id}
        success, response = await self.make_request("POST", "/favors/accept", accept_data)
        if not success:
            await self.log_result("6. Review with Ethical Tags - Setup", False, 
                f"Could not accept favor: {response}")
            return False
        
        # Complete the favor (close distance to pass geofencing)
        complete_data = {
            "favor_id": favor_id,
            "latitude": self.nearby_location["latitude"],  # Close to original location
            "longitude": self.nearby_location["longitude"]
        }
        
        success, response = await self.make_request("POST", "/favors/complete", complete_data)
        if not success:
            await self.log_result("6. Review with Ethical Tags - Setup", False, 
                f"Could not complete favor: {response}")
            return False
        
        # Now create a review with ethical tags
        review_data = {
            "favor_id": favor_id,
            "rating": 5,
            "kindness_rating": 5,
            "impact_rating": 4,
            "ethical_tags": ["educato", "puntuale", "professionale"],
            "comment": "Persona molto gentile e professionale!",
            "public_thanks": "Grazie per l'aiuto con il computer, sei stato fantastico!"
        }
        
        success, response = await self.make_request("POST", "/reviews", review_data)
        
        if success:
            # Check that ethical_tags were saved
            if "ethical_tags" in response:
                saved_tags = response["ethical_tags"]
                expected_tags = ["educato", "puntuale", "professionale"]
                
                if set(saved_tags) == set(expected_tags):
                    await self.log_result("6. Review with Ethical Tags", True, 
                        f"Review created with ethical tags: {saved_tags}")
                    return True
                else:
                    await self.log_result("6. Review with Ethical Tags", False, 
                        f"Ethical tags not saved correctly. Expected: {expected_tags}, Got: {saved_tags}")
                    return False
            else:
                await self.log_result("6. Review with Ethical Tags", False, 
                    "Review response missing 'ethical_tags' field")
                return False
        else:
            await self.log_result("6. Review with Ethical Tags", False, 
                f"Failed to create review with ethical tags: {response}")
            return False

    # ======================== MAIN TEST RUNNER ========================

    async def run_optimized_tests(self):
        """Run all optimized feature tests in sequence"""
        print("🚀 Testing OPTIMIZED FEATURES - Scambio di Favori Backend")
        print(f"📡 API Base URL: {API_BASE_URL}")
        print("=" * 70)

        # Setup
        if not await self.setup_test_user():
            print("❌ Cannot proceed without test user")
            return False

        # Test the optimized features
        print("\n🧪 TESTING OPTIMIZED FEATURES:")
        await self.test_1_currency_info_granelli()
        await self.test_2_new_user_granelli_bonus()  
        await self.test_3_geofencing_100m_fail()
        await self.test_4_social_impact_score_field()
        await self.test_5_ethical_tags_endpoint()
        await self.test_6_review_with_ethical_tags()

        # Summary
        print("\n" + "=" * 70)
        print("📊 OPTIMIZED FEATURES TEST SUMMARY")
        print("=" * 70)
        
        total_tests = self.results['passed'] + self.results['failed']
        
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
    tester = OptimizedFeaturesAPITester()
    
    try:
        success = await tester.run_optimized_tests()
        
        if success:
            print("\n🎉 ALL OPTIMIZED FEATURES TESTS PASSED!")
            sys.exit(0)
        else:
            print("\n⚠️ SOME OPTIMIZED FEATURES TESTS FAILED")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n💥 Testing failed with error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())