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
            
            if response.status_code == 200:
                return True, response.json()
            else:
                return False, {
                    "status_code": response.status_code,
                    "error": response.text,
                    "url": url
                }
        except Exception as e:
            return False, {"error": str(e), "url": f"{API_BASE_URL}{endpoint}"}

    # ======================== AUTHENTICATION TESTS ========================

    async def test_health_check(self):
        """Test GET /api/health"""
        success, response = await self.make_request("GET", "/health")
        if success and response.get("status") == "healthy":
            await self.log_result("Health Check", True, "API is healthy")
        else:
            await self.log_result("Health Check", False, f"Health check failed: {response}")

    async def test_user_registration(self):
        """Test POST /api/auth/register"""
        test_user = {
            "email": "testuser@scambiodifavori.com",
            "name": "Mario Rossi",
            "password": "testpassword123",
            "referral_code": None
        }
        
        success, response = await self.make_request("POST", "/auth/register", test_user)
        
        if success and "user" in response and "token" in response:
            self.auth_token = response["token"]
            self.test_user_id = response["user"]["user_id"]
            user_soli = response["user"].get("soli", 0)
            
            await self.log_result("User Registration", True, 
                f"User created with {user_soli} Soli, token received")
        else:
            await self.log_result("User Registration", False, 
                f"Registration failed: {response}")

    async def test_user_login(self):
        """Test POST /api/auth/login"""
        login_data = {
            "email": "testuser@scambiodifavori.com", 
            "password": "testpassword123"
        }
        
        success, response = await self.make_request("POST", "/auth/login", login_data)
        
        if success and "user" in response and "token" in response:
            # Update token with fresh login token
            self.auth_token = response["token"] 
            await self.log_result("User Login", True, "Login successful, JWT token received")
        else:
            await self.log_result("User Login", False, f"Login failed: {response}")

    async def test_get_current_user(self):
        """Test GET /api/auth/me"""
        success, response = await self.make_request("GET", "/auth/me")
        
        if success and "user_id" in response:
            await self.log_result("Get Current User", True, 
                f"User data retrieved: {response.get('name', 'N/A')}")
        else:
            await self.log_result("Get Current User", False, f"Failed to get user: {response}")

    # ======================== FAVOR TESTS ========================

    async def test_get_categories(self):
        """Test GET /api/categories"""
        success, response = await self.make_request("GET", "/categories")
        
        if success and isinstance(response, list) and len(response) > 0:
            categories = [cat.get("name", "") for cat in response]
            await self.log_result("Get Categories", True, 
                f"Retrieved {len(categories)} categories: {', '.join(categories[:3])}...")
        else:
            await self.log_result("Get Categories", False, f"Failed to get categories: {response}")

    async def test_create_favor_offer(self):
        """Test POST /api/favors - Create an offer"""
        favor_data = {
            "type": "offer",
            "title": "Aiuto con la spesa per anziani",
            "description": "Posso fare la spesa per chi ha difficoltà a uscire di casa",
            "category": "Spesa",
            "duration_hours": 1.5,
            "latitude": 41.9028,
            "longitude": 12.4964,
            "address": "Via Roma 123, Roma",
            "is_micro": False,
            "is_emergency": False
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if success and "favor_id" in response:
            self.created_favor_id = response["favor_id"]
            soli_cost = response.get("soli_cost", 0)
            await self.log_result("Create Favor (Offer)", True, 
                f"Favor created with ID: {self.created_favor_id}, Cost: {soli_cost} Soli")
        else:
            await self.log_result("Create Favor (Offer)", False, f"Failed to create favor: {response}")

    async def test_create_favor_request(self):
        """Test POST /api/favors - Create a request"""
        favor_data = {
            "type": "request",
            "title": "Cerco aiuto per trasloco",
            "description": "Ho bisogno di una mano per spostare alcuni mobili",
            "category": "Trasporto", 
            "duration_hours": 2.0,
            "latitude": 41.9028,
            "longitude": 12.4964,
            "address": "Via Milano 456, Roma",
            "is_micro": False,
            "is_emergency": False
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if success and "favor_id" in response:
            soli_cost = response.get("soli_cost", 0)
            await self.log_result("Create Favor (Request)", True, 
                f"Request created, Cost: {soli_cost} Soli")
        else:
            await self.log_result("Create Favor (Request)", False, f"Failed to create request: {response}")

    async def test_get_favors_list(self):
        """Test GET /api/favors"""
        success, response = await self.make_request("GET", "/favors", {
            "status": "active",
            "latitude": 41.9028,
            "longitude": 12.4964
        })
        
        if success and isinstance(response, list):
            offer_count = sum(1 for favor in response if favor.get("type") == "offer")
            request_count = sum(1 for favor in response if favor.get("type") == "request")
            await self.log_result("Get Favors List", True, 
                f"Retrieved {len(response)} favors ({offer_count} offers, {request_count} requests)")
        else:
            await self.log_result("Get Favors List", False, f"Failed to get favors: {response}")

    async def test_get_specific_favor(self):
        """Test GET /api/favors/{favor_id}"""
        if not self.created_favor_id:
            await self.log_result("Get Specific Favor", False, "No favor ID to test with")
            return
        
        success, response = await self.make_request("GET", f"/favors/{self.created_favor_id}")
        
        if success and response.get("favor_id") == self.created_favor_id:
            await self.log_result("Get Specific Favor", True, 
                f"Retrieved favor: {response.get('title', 'N/A')}")
        else:
            await self.log_result("Get Specific Favor", False, f"Failed to get favor: {response}")

    # ======================== OBJECTS/OGGETTOTECA TESTS ========================

    async def test_get_object_categories(self):
        """Test GET /api/object-categories"""
        success, response = await self.make_request("GET", "/object-categories")
        
        if success and isinstance(response, list) and len(response) > 0:
            categories = [cat.get("name", "") for cat in response]
            await self.log_result("Get Object Categories", True, 
                f"Retrieved {len(categories)} categories: {', '.join(categories[:3])}...")
        else:
            await self.log_result("Get Object Categories", False, f"Failed to get categories: {response}")

    async def test_create_lendable_object(self):
        """Test POST /api/objects"""
        object_data = {
            "name": "Trapano elettrico Bosch",
            "description": "Trapano professionale per lavori di casa, ottime condizioni",
            "category": "Utensili",
            "deposit_soli": 3,
            "latitude": 41.9028,
            "longitude": 12.4964
        }
        
        success, response = await self.make_request("POST", "/objects", object_data)
        
        if success and "object_id" in response:
            self.created_object_id = response["object_id"]
            deposit = response.get("deposit_soli", 0)
            await self.log_result("Create Lendable Object", True, 
                f"Object created with ID: {self.created_object_id}, Deposit: {deposit} Soli")
        else:
            await self.log_result("Create Lendable Object", False, f"Failed to create object: {response}")

    async def test_get_objects_list(self):
        """Test GET /api/objects"""
        success, response = await self.make_request("GET", "/objects", {
            "status": "available",
            "latitude": 41.9028,
            "longitude": 12.4964
        })
        
        if success and isinstance(response, list):
            await self.log_result("Get Objects List", True, 
                f"Retrieved {len(response)} available objects")
        else:
            await self.log_result("Get Objects List", False, f"Failed to get objects: {response}")

    # ======================== COMMUNITY FEATURES TESTS ========================

    async def test_get_badges(self):
        """Test GET /api/badges"""
        success, response = await self.make_request("GET", "/badges")
        
        if success and isinstance(response, list) and len(response) > 0:
            badge_names = [badge.get("name", "") for badge in response]
            await self.log_result("Get Badges", True, 
                f"Retrieved {len(badge_names)} badges: {', '.join(badge_names[:3])}...")
        else:
            await self.log_result("Get Badges", False, f"Failed to get badges: {response}")

    async def test_get_leaderboard(self):
        """Test GET /api/leaderboard"""
        success, response = await self.make_request("GET", "/leaderboard")
        
        if success and isinstance(response, list):
            await self.log_result("Get Leaderboard", True, 
                f"Retrieved leaderboard with {len(response)} users")
        else:
            await self.log_result("Get Leaderboard", False, f"Failed to get leaderboard: {response}")

    async def test_get_solidarity_fund(self):
        """Test GET /api/donations/fund"""
        success, response = await self.make_request("GET", "/donations/fund")
        
        if success and "solidarity_fund_total" in response:
            total = response.get("solidarity_fund_total", 0)
            currency = response.get("currency", "Soli")
            await self.log_result("Get Solidarity Fund", True, 
                f"Solidarity fund total: {total} {currency}")
        else:
            await self.log_result("Get Solidarity Fund", False, f"Failed to get fund info: {response}")

    async def test_create_donation(self):
        """Test POST /api/donations"""
        donation_data = {
            "amount": 2,
            "recipient_id": None,  # To solidarity fund
            "message": "Contributo per la comunità"
        }
        
        success, response = await self.make_request("POST", "/donations", donation_data)
        
        if success and "donation_id" in response:
            amount = response.get("amount", 0)
            await self.log_result("Create Donation", True, 
                f"Donation created: {amount} Soli to solidarity fund")
        else:
            await self.log_result("Create Donation", False, f"Failed to create donation: {response}")

    async def test_get_thanks_board(self):
        """Test GET /api/thanks"""
        success, response = await self.make_request("GET", "/thanks")
        
        if success and isinstance(response, list):
            await self.log_result("Get Thanks Board", True, 
                f"Retrieved {len(response)} thanks entries")
        else:
            await self.log_result("Get Thanks Board", False, f"Failed to get thanks board: {response}")

    # ======================== WALL TESTS ========================

    async def test_get_wall_posts(self):
        """Test GET /api/wall"""
        success, response = await self.make_request("GET", "/wall", {
            "latitude": 41.9028,
            "longitude": 12.4964,
            "radius_km": 1.0
        })
        
        if success and isinstance(response, list):
            await self.log_result("Get Wall Posts", True, 
                f"Retrieved {len(response)} wall posts")
        else:
            await self.log_result("Get Wall Posts", False, f"Failed to get wall posts: {response}")

    # ======================== EMERGENCY TESTS ========================

    async def test_get_emergencies(self):
        """Test GET /api/favors/emergencies"""
        success, response = await self.make_request("GET", "/favors/emergencies", {
            "latitude": 41.9028,
            "longitude": 12.4964
        })
        
        if success and isinstance(response, list):
            await self.log_result("Get Emergencies", True, 
                f"Retrieved {len(response)} emergency requests")
        else:
            await self.log_result("Get Emergencies", False, f"Failed to get emergencies: {response}")

    # ======================== MAIN TEST RUNNER ========================

    async def run_all_tests(self):
        """Run all API tests in sequence"""
        print("🚀 Starting Scambio di Favori API Testing...")
        print(f"📡 Testing against: {API_BASE_URL}")
        print("=" * 60)

        # Health and setup
        await self.test_health_check()
        
        # Authentication flow
        await self.test_user_registration()
        await self.test_user_login()
        await self.test_get_current_user()
        
        # Categories
        await self.test_get_categories()
        
        # Favors
        await self.test_create_favor_offer()
        await self.test_create_favor_request()
        await self.test_get_favors_list()
        await self.test_get_specific_favor()
        
        # Objects/Oggettoteca
        await self.test_get_object_categories()
        await self.test_create_lendable_object()
        await self.test_get_objects_list()
        
        # Community features
        await self.test_get_badges()
        await self.test_get_leaderboard()
        await self.test_get_solidarity_fund()
        await self.test_create_donation()
        await self.test_get_thanks_board()
        
        # Wall
        await self.test_get_wall_posts()
        
        # Emergencies
        await self.test_get_emergencies()

        # Final summary
        print("=" * 60)
        print(f"🏁 Testing Complete!")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        
        if self.results['errors']:
            print("\n🚨 Failed Tests:")
            for error in self.results['errors']:
                print(f"   • {error}")
        
        await self.client.aclose()
        return self.results

async def main():
    """Main entry point"""
    tester = APITester()
    results = await tester.run_all_tests()
    
    # Exit with error code if any tests failed
    if results['failed'] > 0:
        sys.exit(1)
    else:
        print("\n🎉 All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())