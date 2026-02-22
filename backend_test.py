#!/usr/bin/env python3

import asyncio
import aiohttp
import json
from datetime import datetime
import uuid

# Backend URL from frontend environment 
BACKEND_URL = "https://kindness-network.preview.emergentagent.com/api"

class FavorExchangeTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.user1_token = None
        self.user2_token = None
        self.user1_data = None
        self.user2_data = None
        self.test_favor_id = None
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with proper error handling"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with self.session.request(method, url, json=data, headers=headers) as response:
                response_text = await response.text()
                
                print(f"\n{method} {url}")
                print(f"Status: {response.status}")
                if data:
                    print(f"Request body: {json.dumps(data, indent=2)}")
                if headers:
                    print(f"Headers: {headers}")
                print(f"Response: {response_text}")
                
                try:
                    response_data = json.loads(response_text) if response_text else {}
                except json.JSONDecodeError:
                    response_data = {"raw_response": response_text}
                
                return {
                    "status": response.status,
                    "data": response_data,
                    "success": 200 <= response.status < 300
                }
        except Exception as e:
            print(f"Request failed: {str(e)}")
            return {"status": 0, "data": {"error": str(e)}, "success": False}
    
    async def test_user_registration(self):
        """Test user registration endpoint"""
        print("\n" + "="*50)
        print("TESTING USER REGISTRATION")
        print("="*50)
        
        # Generate unique emails for this test run
        timestamp = str(int(datetime.now().timestamp()))
        
        # Register User 1
        user1_data = {
            "email": f"testuser1_{timestamp}@example.com",
            "name": "Test User One",
            "password": "testpassword123"
        }
        
        result1 = await self.make_request("POST", "/auth/register", user1_data)
        
        if result1["success"]:
            self.user1_token = result1["data"]["token"]
            self.user1_data = result1["data"]["user"]
            print(f"✅ User 1 registered successfully with {self.user1_data['credits']} credits")
        else:
            print(f"❌ User 1 registration failed: {result1['data']}")
            return False
        
        # Register User 2
        user2_data = {
            "email": f"testuser2_{timestamp}@example.com", 
            "name": "Test User Two",
            "password": "testpassword456"
        }
        
        result2 = await self.make_request("POST", "/auth/register", user2_data)
        
        if result2["success"]:
            self.user2_token = result2["data"]["token"]
            self.user2_data = result2["data"]["user"]
            print(f"✅ User 2 registered successfully with {self.user2_data['credits']} credits")
        else:
            print(f"❌ User 2 registration failed: {result2['data']}")
            return False
            
        return True
    
    async def test_user_login(self):
        """Test user login endpoint"""
        print("\n" + "="*50)
        print("TESTING USER LOGIN")
        print("="*50)
        
        # Test login with user 1 credentials
        login_data = {
            "email": self.user1_data["email"],
            "password": "testpassword123"
        }
        
        result = await self.make_request("POST", "/auth/login", login_data)
        
        if result["success"] and "token" in result["data"]:
            print("✅ User login successful")
            return True
        else:
            print(f"❌ User login failed: {result['data']}")
            return False
    
    async def test_get_current_user(self):
        """Test get current user endpoint"""
        print("\n" + "="*50)
        print("TESTING GET CURRENT USER")
        print("="*50)
        
        headers = {"Authorization": f"Bearer {self.user1_token}"}
        result = await self.make_request("GET", "/auth/me", headers=headers)
        
        if result["success"] and "user_id" in result["data"]:
            print("✅ Get current user successful")
            return True
        else:
            print(f"❌ Get current user failed: {result['data']}")
            return False
    
    async def test_create_favor_offer(self):
        """Test creating an OFFER type favor"""
        print("\n" + "="*50)
        print("TESTING CREATE FAVOR (OFFER)")
        print("="*50)
        
        favor_data = {
            "type": "offer",
            "title": "Help with shopping",
            "description": "I can help you with grocery shopping",
            "category": "Spesa",
            "credits_cost": 2,
            "latitude": 45.4642,
            "longitude": 9.1900,
            "address": "Milan, Italy"
        }
        
        headers = {"Authorization": f"Bearer {self.user1_token}"}
        result = await self.make_request("POST", "/favors", favor_data, headers)
        
        if result["success"] and "favor_id" in result["data"]:
            self.test_favor_id = result["data"]["favor_id"]
            print(f"✅ Favor created successfully: {self.test_favor_id}")
            return True
        else:
            print(f"❌ Favor creation failed: {result['data']}")
            return False
    
    async def test_get_favors(self):
        """Test getting all favors"""
        print("\n" + "="*50)
        print("TESTING GET ALL FAVORS")
        print("="*50)
        
        result = await self.make_request("GET", "/favors")
        
        if result["success"] and isinstance(result["data"], list):
            print(f"✅ Retrieved {len(result['data'])} favors")
            return True
        else:
            print(f"❌ Get favors failed: {result['data']}")
            return False
    
    async def test_get_my_favors(self):
        """Test getting current user's favors"""
        print("\n" + "="*50)
        print("TESTING GET MY FAVORS")
        print("="*50)
        
        headers = {"Authorization": f"Bearer {self.user1_token}"}
        result = await self.make_request("GET", "/favors/my", headers=headers)
        
        if result["success"] and isinstance(result["data"], list):
            print(f"✅ Retrieved {len(result['data'])} user favors")
            return True
        else:
            print(f"❌ Get my favors failed: {result['data']}")
            return False
    
    async def test_accept_favor(self):
        """Test accepting a favor (User 2 accepts User 1's offer)"""
        print("\n" + "="*50)
        print("TESTING ACCEPT FAVOR")
        print("="*50)
        
        if not self.test_favor_id:
            print("❌ No favor available to accept")
            return False
        
        accept_data = {"favor_id": self.test_favor_id}
        headers = {"Authorization": f"Bearer {self.user2_token}"}
        
        result = await self.make_request("POST", "/favors/accept", accept_data, headers)
        
        if result["success"] and result["data"].get("status") == "accepted":
            print("✅ Favor accepted successfully")
            return True
        else:
            print(f"❌ Accept favor failed: {result['data']}")
            return False
    
    async def test_complete_favor(self):
        """Test completing a favor (User 1 completes the favor)"""
        print("\n" + "="*50)
        print("TESTING COMPLETE FAVOR")
        print("="*50)
        
        if not self.test_favor_id:
            print("❌ No favor available to complete")
            return False
        
        # Get current credits before completion
        headers1 = {"Authorization": f"Bearer {self.user1_token}"}
        headers2 = {"Authorization": f"Bearer {self.user2_token}"}
        
        user1_before = await self.make_request("GET", "/auth/me", headers=headers1)
        user2_before = await self.make_request("GET", "/auth/me", headers=headers2)
        
        if not (user1_before["success"] and user2_before["success"]):
            print("❌ Could not get user data before completion")
            return False
        
        credits1_before = user1_before["data"]["credits"]
        credits2_before = user2_before["data"]["credits"]
        
        print(f"Before completion - User1: {credits1_before} credits, User2: {credits2_before} credits")
        
        # Complete the favor
        complete_data = {"favor_id": self.test_favor_id}
        result = await self.make_request("POST", "/favors/complete", complete_data, headers1)
        
        if not result["success"]:
            print(f"❌ Complete favor failed: {result['data']}")
            return False
        
        # Check credits after completion
        user1_after = await self.make_request("GET", "/auth/me", headers=headers1)
        user2_after = await self.make_request("GET", "/auth/me", headers=headers2)
        
        if not (user1_after["success"] and user2_after["success"]):
            print("❌ Could not get user data after completion")
            return False
        
        credits1_after = user1_after["data"]["credits"]
        credits2_after = user2_after["data"]["credits"]
        
        print(f"After completion - User1: {credits1_after} credits, User2: {credits2_after} credits")
        
        # For OFFER type: User1 (creator) should gain credits, User2 (accepter) should lose credits
        expected_credits1 = credits1_before + 2  # User1 gains 2 credits
        expected_credits2 = credits2_before - 2  # User2 loses 2 credits
        
        if credits1_after == expected_credits1 and credits2_after == expected_credits2:
            print("✅ Credit transfer completed successfully")
            return True
        else:
            print(f"❌ Credit transfer incorrect. Expected User1: {expected_credits1}, User2: {expected_credits2}")
            return False
    
    async def test_create_review(self):
        """Test creating a review for the completed favor"""
        print("\n" + "="*50)
        print("TESTING CREATE REVIEW")
        print("="*50)
        
        if not self.test_favor_id:
            print("❌ No favor available to review")
            return False
        
        review_data = {
            "favor_id": self.test_favor_id,
            "rating": 5,
            "comment": "Excellent service, very helpful!"
        }
        
        # User 2 (accepter) reviews User 1 (creator)  
        headers = {"Authorization": f"Bearer {self.user2_token}"}
        result = await self.make_request("POST", "/reviews", review_data, headers)
        
        if result["success"] and "review_id" in result["data"]:
            print("✅ Review created successfully")
            return True
        else:
            print(f"❌ Create review failed: {result['data']}")
            return False
    
    async def test_error_cases(self):
        """Test various error cases"""
        print("\n" + "="*50)
        print("TESTING ERROR CASES")
        print("="*50)
        
        results = []
        
        # Test 1: User cannot accept their own favor
        if self.test_favor_id:
            # Create another favor for this test
            favor_data = {
                "type": "offer", 
                "title": "Test favor for error case",
                "description": "Testing self-acceptance",
                "category": "Altro",
                "credits_cost": 1
            }
            
            headers1 = {"Authorization": f"Bearer {self.user1_token}"}
            favor_result = await self.make_request("POST", "/favors", favor_data, headers1)
            
            if favor_result["success"]:
                new_favor_id = favor_result["data"]["favor_id"]
                
                # Try to accept own favor
                accept_data = {"favor_id": new_favor_id}
                result = await self.make_request("POST", "/favors/accept", accept_data, headers1)
                
                if result["status"] == 400:
                    print("✅ Correctly prevented self-acceptance")
                    results.append(True)
                else:
                    print("❌ Should not allow self-acceptance")
                    results.append(False)
            else:
                print("❌ Could not create favor for error test")
                results.append(False)
        
        # Test 2: Cannot complete favor that isn't accepted
        favor_data = {
            "type": "offer",
            "title": "Favor for completion test", 
            "description": "Testing completion without acceptance",
            "category": "Altro",
            "credits_cost": 1
        }
        
        headers1 = {"Authorization": f"Bearer {self.user1_token}"}
        favor_result = await self.make_request("POST", "/favors", favor_data, headers1)
        
        if favor_result["success"]:
            unaccepted_favor_id = favor_result["data"]["favor_id"]
            complete_data = {"favor_id": unaccepted_favor_id}
            result = await self.make_request("POST", "/favors/complete", complete_data, headers1)
            
            if result["status"] == 400:
                print("✅ Correctly prevented completion of unaccepted favor")
                results.append(True)
            else:
                print("❌ Should not allow completion of unaccepted favor")
                results.append(False)
        else:
            print("❌ Could not create favor for completion test")
            results.append(False)
        
        # Test 3: Test REQUEST type favor requires sufficient credits
        broke_user_data = {
            "email": f"brokeuser_{int(datetime.now().timestamp())}@example.com",
            "name": "Broke User",
            "password": "password123"
        }
        
        broke_user_result = await self.make_request("POST", "/auth/register", broke_user_data)
        
        if broke_user_result["success"]:
            broke_token = broke_user_result["data"]["token"]
            
            # Try to create a REQUEST favor that costs more than starting credits (10)
            expensive_request = {
                "type": "request",
                "title": "Expensive request",
                "description": "This costs too much",
                "category": "Altro", 
                "credits_cost": 15  # More than 10 starting credits
            }
            
            broke_headers = {"Authorization": f"Bearer {broke_token}"}
            result = await self.make_request("POST", "/favors", expensive_request, broke_headers)
            
            if result["status"] == 400:
                print("✅ Correctly prevented expensive request creation")
                results.append(True)
            else:
                print("❌ Should prevent creating request with insufficient credits")
                results.append(False)
        else:
            print("❌ Could not create broke user for credit test")
            results.append(False)
        
        return all(results)
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Scambio di Favori Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        
        test_results = {}
        
        # Core functionality tests
        test_results["registration"] = await self.test_user_registration()
        if not test_results["registration"]:
            print("❌ Registration failed - stopping tests")
            return test_results
        
        test_results["login"] = await self.test_user_login()
        test_results["get_current_user"] = await self.test_get_current_user()
        test_results["create_favor"] = await self.test_create_favor_offer()
        test_results["get_favors"] = await self.test_get_favors()
        test_results["get_my_favors"] = await self.test_get_my_favors()
        test_results["accept_favor"] = await self.test_accept_favor()
        test_results["complete_favor"] = await self.test_complete_favor()
        test_results["create_review"] = await self.test_create_review()
        test_results["error_cases"] = await self.test_error_cases()
        
        # Print final results
        print("\n" + "="*60)
        print("FINAL TEST RESULTS")
        print("="*60)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test_name.replace('_', ' ').title()}: {status}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed!")
        else:
            print(f"⚠️  {total - passed} tests failed")
        
        return test_results

async def main():
    """Main function to run tests"""
    async with FavorExchangeTester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    results = asyncio.run(main())