#!/usr/bin/env python3
"""
Advanced Backend Testing for Accept/Complete Favor Flow
Tests the specific endpoints that need retesting according to test_result.md
"""

import asyncio
import httpx
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Get the backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://granelli-app-1.preview.emergentagent.com')
API_BASE_URL = f"{BACKEND_URL}/api"

class AdvancedAPITester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.user1_token = None
        self.user2_token = None
        self.user1_id = None
        self.user2_id = None
        self.created_favor_id = None
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }

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

    async def make_request(self, method: str, endpoint: str, data: dict = None, headers: dict = None, token: str = None) -> tuple[bool, dict]:
        """Make HTTP request and return (success, response_data)"""
        try:
            url = f"{API_BASE_URL}{endpoint}"
            request_headers = headers or {}
            
            if token:
                request_headers["Authorization"] = f"Bearer {token}"
            
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
                    "error": response.text[:500] if hasattr(response, 'text') else str(response),
                    "url": url
                }
        except Exception as e:
            return False, {"error": str(e), "url": f"{API_BASE_URL}{endpoint}"}

    async def setup_two_users(self):
        """Create two users for testing accept/complete flow"""
        
        # Create User 1 (Favor Creator)
        user1_data = {
            "email": "creator@scambiofavori.test",
            "name": "Anna Verdi", 
            "password": "testpass123"
        }
        
        success, response = await self.make_request("POST", "/auth/register", user1_data)
        if success and "token" in response:
            self.user1_token = response["token"]
            self.user1_id = response["user"]["user_id"]
            user1_soli = response["user"].get("soli", 0)
            await self.log_result("User 1 Registration (Creator)", True, 
                f"User created with {user1_soli} Soli")
        else:
            await self.log_result("User 1 Registration (Creator)", False, f"Failed: {response}")
            return False

        # Create User 2 (Favor Acceptor)
        user2_data = {
            "email": "acceptor@scambiofavori.test", 
            "name": "Marco Bianchi",
            "password": "testpass456"
        }
        
        success, response = await self.make_request("POST", "/auth/register", user2_data)
        if success and "token" in response:
            self.user2_token = response["token"]
            self.user2_id = response["user"]["user_id"]
            user2_soli = response["user"].get("soli", 0)
            await self.log_result("User 2 Registration (Acceptor)", True, 
                f"User created with {user2_soli} Soli")
        else:
            await self.log_result("User 2 Registration (Acceptor)", False, f"Failed: {response}")
            return False

        return True

    async def create_test_favor(self):
        """Create a favor as User 1"""
        favor_data = {
            "type": "request",
            "title": "Aiuto per assemblaggio IKEA",
            "description": "Ho bisogno di aiuto per montare una libreria IKEA, circa 2 ore di lavoro",
            "category": "Altro",
            "duration_hours": 2.0,
            "latitude": 41.9028,
            "longitude": 12.4964,
            "address": "Via dei Test 123, Roma",
            "is_micro": False,
            "is_emergency": False
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data, token=self.user1_token)
        
        if success and "favor_id" in response:
            self.created_favor_id = response["favor_id"]
            soli_cost = response.get("soli_cost", 0)
            await self.log_result("Create Test Favor", True, 
                f"Favor created with ID: {self.created_favor_id}, Cost: {soli_cost} Soli")
            return True
        else:
            await self.log_result("Create Test Favor", False, f"Failed: {response}")
            return False

    async def test_accept_favor(self):
        """Test POST /api/favors/accept - User 2 accepts User 1's favor"""
        if not self.created_favor_id:
            await self.log_result("Accept Favor", False, "No favor available to accept")
            return False
        
        accept_data = {"favor_id": self.created_favor_id}
        
        success, response = await self.make_request("POST", "/favors/accept", accept_data, token=self.user2_token)
        
        if success and response.get("status") == "accepted":
            accepted_by = response.get("accepted_by")
            accepted_by_name = response.get("accepted_by_name")
            await self.log_result("Accept Favor", True, 
                f"Favor accepted by {accepted_by_name} (ID: {accepted_by})")
            
            # Verify exact location is now revealed to acceptor
            exact_lat = response.get("exact_latitude")
            exact_lon = response.get("exact_longitude")
            if exact_lat and exact_lon:
                await self.log_result("Location Reveal on Accept", True, 
                    f"Exact location revealed: {exact_lat}, {exact_lon}")
            else:
                await self.log_result("Location Reveal on Accept", False, 
                    "Exact location not revealed after acceptance")
            
            return True
        else:
            await self.log_result("Accept Favor", False, f"Failed: {response}")
            return False

    async def test_complete_favor(self):
        """Test POST /api/favors/complete - User 1 completes the favor"""
        if not self.created_favor_id:
            await self.log_result("Complete Favor", False, "No favor available to complete")
            return False
        
        # Get user balances before completion
        success1, user1_before = await self.make_request("GET", "/auth/me", token=self.user1_token)
        success2, user2_before = await self.make_request("GET", "/auth/me", token=self.user2_token)
        
        if not (success1 and success2):
            await self.log_result("Complete Favor", False, "Could not get user balances")
            return False
        
        user1_soli_before = user1_before.get("soli", 0)
        user2_soli_before = user2_before.get("soli", 0)
        
        print(f"    Before completion - User1: {user1_soli_before} Soli, User2: {user2_soli_before} Soli")
        
        # Complete the favor (only creator can complete)
        complete_data = {"favor_id": self.created_favor_id}
        
        success, response = await self.make_request("POST", "/favors/complete", complete_data, token=self.user1_token)
        
        if success and response.get("status") == "completed":
            await self.log_result("Complete Favor Status", True, 
                f"Favor marked as completed at {response.get('completed_at', 'N/A')}")
            
            # Check Soli transfer
            success1, user1_after = await self.make_request("GET", "/auth/me", token=self.user1_token)
            success2, user2_after = await self.make_request("GET", "/auth/me", token=self.user2_token)
            
            if success1 and success2:
                user1_soli_after = user1_after.get("soli", 0)
                user2_soli_after = user2_after.get("soli", 0)
                
                user1_diff = user1_soli_after - user1_soli_before
                user2_diff = user2_soli_after - user2_soli_before
                
                print(f"    After completion - User1: {user1_soli_after} Soli (diff: {user1_diff}), User2: {user2_soli_after} Soli (diff: {user2_diff})")
                
                # For a request: creator loses Soli, acceptor gains Soli
                if user1_diff < 0 and user2_diff > 0:
                    await self.log_result("Soli Transfer (Credit System)", True, 
                        f"Correct transfer: Creator paid {abs(user1_diff)} Soli, Acceptor received {user2_diff} Soli")
                else:
                    await self.log_result("Soli Transfer (Credit System)", False, 
                        f"Incorrect transfer: Creator diff {user1_diff}, Acceptor diff {user2_diff}")
            else:
                await self.log_result("Soli Transfer (Credit System)", False, "Could not verify Soli transfer")
            
            return True
        else:
            await self.log_result("Complete Favor", False, f"Failed: {response}")
            return False

    async def test_create_review(self):
        """Test POST /api/reviews - Create a review after favor completion"""
        if not self.created_favor_id:
            await self.log_result("Create Review", False, "No completed favor to review")
            return False
        
        review_data = {
            "favor_id": self.created_favor_id,
            "rating": 5,
            "kindness_rating": 5, 
            "impact_rating": 4,
            "comment": "Ottimo aiuto, molto disponibile e puntuale!",
            "public_thanks": "Grazie a Marco per l'aiuto con l'assemblaggio, persona fantastica!"
        }
        
        # User 1 (creator) reviews User 2 (acceptor)
        success, response = await self.make_request("POST", "/reviews", review_data, token=self.user1_token)
        
        if success and "review_id" in response:
            review_id = response.get("review_id")
            reviewed_id = response.get("reviewed_id")
            public_thanks = response.get("public_thanks")
            
            await self.log_result("Create Review", True, 
                f"Review created (ID: {review_id}) for user {reviewed_id}")
            
            if public_thanks:
                await self.log_result("Public Thanks Integration", True, 
                    "Public thanks message added to Bacheca dei Grazie")
            
            return True
        else:
            await self.log_result("Create Review", False, f"Failed: {response}")
            return False

    async def test_google_oauth_endpoint(self):
        """Test Google OAuth session exchange endpoint"""
        # This will fail without a real session_id, but we can test the endpoint exists
        test_data = {"session_id": "invalid_test_session_id"}
        
        success, response = await self.make_request("POST", "/auth/session", test_data)
        
        # We expect this to fail with 401, which means the endpoint is working
        if not success and response.get("status_code") == 401:
            await self.log_result("Google OAuth Session Exchange", True, 
                "Endpoint exists and properly validates session_id")
        else:
            await self.log_result("Google OAuth Session Exchange", False, 
                f"Unexpected response: {response}")

    async def test_logout_endpoint(self):
        """Test POST /api/auth/logout"""
        success, response = await self.make_request("POST", "/auth/logout", token=self.user1_token)
        
        if success and "message" in response:
            await self.log_result("User Logout", True, response.get("message", "Logout successful"))
        else:
            await self.log_result("User Logout", False, f"Failed: {response}")

    async def run_advanced_tests(self):
        """Run the advanced API tests focusing on high-priority endpoints"""
        print("🚀 Starting Advanced Scambio di Favori API Testing...")
        print(f"📡 Testing against: {API_BASE_URL}")
        print("🎯 Focus: Accept/Complete Favor Flow & Credit Transfer")
        print("=" * 70)

        # Setup users
        setup_success = await self.setup_two_users()
        if not setup_success:
            print("❌ Failed to setup test users, aborting")
            return self.results

        # Create favor
        favor_created = await self.create_test_favor()
        if not favor_created:
            print("❌ Failed to create test favor, aborting")
            return self.results

        # Test accept/complete flow
        await self.test_accept_favor()
        await self.test_complete_favor()
        await self.test_create_review()

        # Test other high-priority endpoints
        await self.test_google_oauth_endpoint()
        await self.test_logout_endpoint()

        # Final summary
        print("=" * 70)
        print(f"🏁 Advanced Testing Complete!")
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
    tester = AdvancedAPITester()
    results = await tester.run_advanced_tests()
    
    # Exit with error code if any critical tests failed
    critical_failures = [error for error in results['errors'] 
                        if any(critical in error for critical in 
                              ['Accept Favor', 'Complete Favor', 'Soli Transfer'])]
    
    if critical_failures:
        print(f"\n❌ Critical failures detected: {len(critical_failures)}")
        sys.exit(1)
    else:
        print("\n🎉 All critical tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())