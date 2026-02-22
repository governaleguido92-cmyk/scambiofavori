#!/usr/bin/env python3
"""
Simple Social Debt Limit System Test - Direct Granelli Manipulation
Tests debt endpoints by directly manipulating user balance in database
"""

import asyncio
import httpx
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Get the backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://favor-exchange-5.preview.emergentagent.com')
API_BASE_URL = f"{BACKEND_URL}/api"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

class SimpleDebtTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.mongo_client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]
        self.auth_token = None
        self.test_user_id = None
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

    async def make_request(self, method: str, endpoint: str, data: dict = None) -> tuple[bool, dict]:
        """Make HTTP request and return (success, response_data)"""
        try:
            url = f"{API_BASE_URL}{endpoint}"
            headers = {}
            
            if self.auth_token:
                headers["Authorization"] = f"Bearer {self.auth_token}"
            
            if method.upper() == "GET":
                response = await self.client.get(url, headers=headers, params=data)
            elif method.upper() == "POST":
                response = await self.client.post(url, json=data, headers=headers)
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
            return False, {"error": str(e)}

    async def setup_test_user(self):
        """Register a new test user"""
        timestamp = datetime.now().microsecond
        test_user = {
            "email": f"simple_debt_{timestamp}@scambiodifavori.com",
            "name": "Anna Debitrice",
            "password": "annadebito123"
        }
        
        success, response = await self.make_request("POST", "/auth/register", test_user)
        
        if success and "user" in response and "token" in response:
            self.auth_token = response["token"]
            self.test_user_id = response["user"]["user_id"]
            user_granelli = response["user"].get("granelli", 0)
            
            await self.log_result("Setup Test User", True, 
                f"User Anna created with {user_granelli} Granelli, ID: {self.test_user_id}")
            return True
        else:
            await self.log_result("Setup Test User", False, 
                f"Registration failed: {response}")
            return False

    async def set_user_granelli(self, granelli_value: int):
        """Directly set user's granelli balance in database"""
        try:
            result = await self.db.users.update_one(
                {"user_id": self.test_user_id},
                {"$set": {"granelli": granelli_value}}
            )
            
            if result.modified_count > 0:
                print(f"    📊 Set user granelli to {granelli_value}")
                return True
            else:
                print(f"    ❌ Failed to update granelli balance")
                return False
        except Exception as e:
            print(f"    ❌ Database error: {str(e)}")
            return False

    async def test_1_debt_status_endpoint(self):
        """Test 1: Test debt-status endpoint with various balance levels"""
        
        # Test with positive balance
        await self.set_user_granelli(5)
        success, response = await self.make_request("GET", "/debt-status")
        
        if success:
            granelli = response.get("granelli", 0)
            in_debt = response.get("in_debt", True)
            can_request = response.get("can_request", False)
            debt_limit = response.get("debt_limit", 0)
            reliability_score = response.get("reliability_score", 0)
            
            if granelli == 5 and not in_debt and can_request and debt_limit == -3 and reliability_score == 5.0:
                await self.log_result("1a. Debt Status - Positive Balance", True, 
                    f"Correct: granelli=5, in_debt=False, can_request=True")
            else:
                await self.log_result("1a. Debt Status - Positive Balance", False, 
                    f"Values: granelli={granelli}, in_debt={in_debt}, can_request={can_request}")
                return False
        else:
            await self.log_result("1a. Debt Status - Positive Balance", False, 
                f"Failed to get debt status: {response}")
            return False

        # Test with debt balance (-2, should still allow requests)
        await self.set_user_granelli(-2)
        success, response = await self.make_request("GET", "/debt-status")
        
        if success:
            granelli = response.get("granelli", 0)
            in_debt = response.get("in_debt", False)
            can_request = response.get("can_request", True)
            
            if granelli == -2 and in_debt and can_request:
                await self.log_result("1b. Debt Status - Moderate Debt", True, 
                    f"Correct: granelli=-2, in_debt=True, can_request=True")
            else:
                await self.log_result("1b. Debt Status - Moderate Debt", False, 
                    f"Values: granelli={granelli}, in_debt={in_debt}, can_request={can_request}")
                return False
        else:
            await self.log_result("1b. Debt Status - Moderate Debt", False, 
                f"Failed to get debt status: {response}")
            return False

        # Test at debt limit (-3, should block requests)
        await self.set_user_granelli(-3)
        success, response = await self.make_request("GET", "/debt-status")
        
        if success:
            granelli = response.get("granelli", 0)
            in_debt = response.get("in_debt", False)
            can_request = response.get("can_request", True)
            
            if granelli == -3 and in_debt and not can_request:
                await self.log_result("1c. Debt Status - At Limit", True, 
                    f"Correct: granelli=-3, in_debt=True, can_request=False")
                return True
            else:
                await self.log_result("1c. Debt Status - At Limit", False, 
                    f"Values: granelli={granelli}, in_debt={in_debt}, can_request={can_request}")
                return False
        else:
            await self.log_result("1c. Debt Status - At Limit", False, 
                f"Failed to get debt status: {response}")
            return False

    async def test_2_debt_block_favor_request(self):
        """Test 2: Verify favor request block when at debt limit"""
        
        # Ensure user is at debt limit
        await self.set_user_granelli(-3)
        
        # Try to create a favor request (should be blocked)
        favor_data = {
            "type": "request",
            "title": "Richiesta che dovrebbe essere bloccata",
            "description": "Questa richiesta deve essere bloccata per debito",
            "category": "Aiuto Rapido",
            "duration_hours": 1.0,
            "latitude": 41.8902,
            "longitude": 12.4922,
            "address": "Via del Blocco, Roma",
            "is_micro": True
        }
        
        success, response = await self.make_request("POST", "/favors", favor_data)
        
        if not success and response.get("status_code") == 403:
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            expected_message = "Il tuo serbatoio di tempo è vuoto. Offri un piccolo aiuto per ricaricarlo!"
            if expected_message in error_msg:
                await self.log_result("2. Debt Block on Favor Request", True, 
                    f"Correctly blocked: '{error_msg}'")
                return True
            else:
                await self.log_result("2. Debt Block on Favor Request", False, 
                    f"Wrong error message: '{error_msg}'")
                return False
        else:
            await self.log_result("2. Debt Block on Favor Request", False, 
                f"Expected 403 block, got: {response}")
            return False

    async def test_3_debt_recovery_system(self):
        """Test 3: Test debt recovery functionality"""
        
        # Set user in debt (-2 granelli)
        await self.set_user_granelli(-2)
        
        # Add some granelli to solidarity fund by simulating donations
        donation_doc = {
            "donation_id": f"test_fund_{datetime.now().microsecond}",
            "donor_id": "test_system",
            "donor_name": "Test System",
            "amount": 10,
            "is_solidarity_fund": True,
            "message": "Test fund for debt recovery",
            "created_at": datetime.now()
        }
        await self.db.donations.insert_one(donation_doc)
        print("    💰 Added 10 granelli to solidarity fund")
        
        # Try debt recovery
        success, response = await self.make_request("POST", "/debt-recovery/request")
        
        if success:
            amount_received = response.get("amount_received", 0)
            new_balance = response.get("new_balance", 0)
            returned_positive = response.get("returned_positive", False)
            
            # Should receive 2 granelli (to cover debt) and return to 0 balance
            if amount_received == 2 and new_balance == 0 and returned_positive:
                await self.log_result("3. Debt Recovery System", True, 
                    f"Correctly recovered {amount_received} granelli, new balance: {new_balance}")
                
                # Check debt status after recovery
                success2, debt_status = await self.make_request("GET", "/debt-status")
                if success2 and debt_status.get("in_debt_recovery"):
                    print("    ✅ in_debt_recovery flag correctly set")
                    return True
                else:
                    await self.log_result("3. Debt Recovery Flag", False, 
                        "in_debt_recovery flag not set correctly")
                    return False
            else:
                await self.log_result("3. Debt Recovery System", False, 
                    f"Incorrect recovery: received={amount_received}, balance={new_balance}, positive={returned_positive}")
                return False
        else:
            await self.log_result("3. Debt Recovery System", False, 
                f"Debt recovery failed: {response}")
            return False

    async def test_4_creator_in_debt_flag(self):
        """Test 4: Test creator_in_debt flag on offers"""
        
        # Set user in debt
        await self.set_user_granelli(-1)
        
        # Create an offer while in debt
        offer_data = {
            "type": "offer",
            "title": "Offerta da utente in debito",
            "description": "Questa offerta dovrebbe avere creator_in_debt=True",
            "category": "Aiuto Rapido",
            "duration_hours": 1.0,
            "latitude": 41.8902,
            "longitude": 12.4922,
            "address": "Via della Solidarietà, Roma",
            "is_micro": True
        }
        
        success, response = await self.make_request("POST", "/favors", offer_data)
        
        if success:
            creator_in_debt = response.get("creator_in_debt", False)
            
            if creator_in_debt is True:
                await self.log_result("4. Creator In Debt Flag", True, 
                    f"creator_in_debt correctly set to True for debt user offer")
                return True
            else:
                await self.log_result("4. Creator In Debt Flag", False, 
                    f"creator_in_debt incorrectly set to {creator_in_debt} (should be True)")
                return False
        else:
            await self.log_result("4. Creator In Debt Flag", False, 
                f"Failed to create offer while in debt: {response}")
            return False

    async def test_5_reliability_score_tracking(self):
        """Test 5: Test reliability score system"""
        
        success, user_response = await self.make_request("GET", "/auth/me")
        
        if success:
            reliability_score = user_response.get("reliability_score", 0)
            
            if reliability_score == 5.0:
                await self.log_result("5. Reliability Score System", True, 
                    f"Reliability score: {reliability_score} (correct initial value)")
                return True
            else:
                await self.log_result("5. Reliability Score System", False, 
                    f"Incorrect reliability score: {reliability_score} (expected 5.0)")
                return False
        else:
            await self.log_result("5. Reliability Score System", False, 
                f"Failed to get user info: {user_response}")
            return False

    async def run_tests(self):
        """Run all debt system tests"""
        print("🚀 Testing SOCIAL DEBT LIMIT SYSTEM - Direct Database Method")
        print(f"📡 API Base URL: {API_BASE_URL}")
        print("=" * 70)

        # Setup
        if not await self.setup_test_user():
            print("❌ Cannot proceed without test user")
            return False

        # Run tests
        print("\n🧪 TESTING SOCIAL DEBT LIMIT FEATURES:")
        await self.test_1_debt_status_endpoint()
        await self.test_2_debt_block_favor_request()
        await self.test_3_debt_recovery_system()
        await self.test_4_creator_in_debt_flag()
        await self.test_5_reliability_score_tracking()

        # Summary
        print("\n" + "=" * 70)
        print("📊 SOCIAL DEBT LIMIT TEST SUMMARY")
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
        await self.mongo_client.close()
        return self.results['failed'] == 0

async def main():
    """Main entry point"""
    tester = SimpleDebtTester()
    
    try:
        success = await tester.run_tests()
        
        if success:
            print("\n🎉 ALL SOCIAL DEBT LIMIT TESTS PASSED!")
            return 0
        else:
            print("\n⚠️ SOME SOCIAL DEBT LIMIT TESTS FAILED")
            return 1
            
    except Exception as e:
        print(f"\n💥 Testing failed with error: {str(e)}")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))