#!/usr/bin/env python3
"""
Social Debt Limit System Testing for Scambio di Favori API
Tests the complete debt management system including debt status, blocks, recovery, and priority highlighting.
"""

import asyncio
import httpx
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Get the backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://kindness-hub-13.preview.emergentagent.com')
API_BASE_URL = f"{BACKEND_URL}/api"

class SocialDebtAPITester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.auth_token = None
        self.test_user_id = None
        self.test_user_email = None
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
        """Register a new test user for debt testing"""
        timestamp = datetime.now().microsecond
        self.test_user_email = f"debttest_{timestamp}@scambiodifavori.com"
        
        test_user = {
            "email": self.test_user_email,
            "name": "Marco Testatore",  # Real Italian name
            "password": "marcotest123"
        }
        
        success, response = await self.make_request("POST", "/auth/register", test_user)
        
        if success and "user" in response and "token" in response:
            self.auth_token = response["token"]
            self.test_user_id = response["user"]["user_id"]
            user_granelli = response["user"].get("granelli", 0)
            
            await self.log_result("Setup Test User", True, 
                f"User Marco created with {user_granelli} Granelli, ID: {self.test_user_id}")
            return True
        else:
            await self.log_result("Setup Test User", False, 
                f"Registration failed: {response}")
            return False

    async def simulate_debt_by_spending_granelli(self):
        """Create debt by making favor requests that cost granelli"""
        print("📉 Simulating debt by creating favor requests...")
        
        # Create 5 favor requests to spend initial 3 granelli and go into debt
        favors_created = 0
        for i in range(5):
            favor_data = {
                "type": "request",
                "title": f"Aiuto per spesa {i+1}",
                "description": f"Ho bisogno di aiuto per portare la spesa - richiesta {i+1}",
                "category": "Spesa",
                "duration_hours": 1.0,
                "latitude": 41.8902,
                "longitude": 12.4922,
                "address": f"Via del Test {i+1}, Roma"
            }
            
            success, response = await self.make_request("POST", "/favors", favor_data)
            if success:
                favors_created += 1
                print(f"    Created favor {i+1}: {response.get('title')}")
            else:
                # Check if it's the debt block error
                if response.get("status_code") == 403:
                    print(f"    ✅ Debt block triggered at favor {i+1}")
                    break
                else:
                    print(f"    ❌ Unexpected error on favor {i+1}: {response}")
        
        print(f"📊 Created {favors_created} favors before hitting debt limit")
        return favors_created

    # ======================== DEBT SYSTEM TESTS ========================

    async def test_1_initial_debt_status(self):
        """Test 1: Check initial debt status for new user"""
        success, response = await self.make_request("GET", "/debt-status")
        
        if success:
            expected_fields = ["granelli", "in_debt", "can_request", "debt_limit", "reliability_score", "in_debt_recovery"]
            missing_fields = [field for field in expected_fields if field not in response]
            
            if missing_fields:
                await self.log_result("1. Initial Debt Status Structure", False, 
                    f"Missing fields: {missing_fields}")
                return False
            
            # Check initial values
            granelli = response.get("granelli", 0)
            in_debt = response.get("in_debt", False)
            can_request = response.get("can_request", False)
            debt_limit = response.get("debt_limit", 0)
            reliability_score = response.get("reliability_score", 0)
            
            if granelli == 3 and not in_debt and can_request and debt_limit == -3 and reliability_score == 5.0:
                await self.log_result("1. Initial Debt Status", True, 
                    f"Correct initial state: {granelli} granelli, can_request=True, reliability=5.0")
                return True
            else:
                await self.log_result("1. Initial Debt Status", False, 
                    f"Incorrect initial values: granelli={granelli}, in_debt={in_debt}, can_request={can_request}, debt_limit={debt_limit}, reliability={reliability_score}")
                return False
        else:
            await self.log_result("1. Initial Debt Status", False, 
                f"Failed to get debt status: {response}")
            return False

    async def test_2_debt_block_on_favor_request(self):
        """Test 2: Verify 403 block when user tries to request favor at debt limit"""
        
        # First simulate debt by spending granelli
        await self.simulate_debt_by_spending_granelli()
        
        # Now check debt status
        success, debt_response = await self.make_request("GET", "/debt-status")
        if success:
            granelli = debt_response.get("granelli", 0)
            can_request = debt_response.get("can_request", True)
            print(f"    Current balance: {granelli} granelli, can_request: {can_request}")
        
        # Try to create another favor request (should be blocked)
        blocked_favor = {
            "type": "request",
            "title": "Richiesta bloccata per debito",
            "description": "Questa richiesta dovrebbe essere bloccata dal sistema di debito",
            "category": "Compagnia",
            "duration_hours": 2.0,
            "latitude": 41.8986,
            "longitude": 12.4769,
            "address": "Via del Blocco, Roma"
        }
        
        success, response = await self.make_request("POST", "/favors", blocked_favor)
        
        if not success and response.get("status_code") == 403:
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            expected_message = "Il tuo serbatoio di tempo è vuoto. Offri un piccolo aiuto per ricaricarlo!"
            if expected_message in error_msg:
                await self.log_result("2. Debt Block on Favor Request", True, 
                    f"Correctly blocked with message: '{error_msg}'")
                return True
            else:
                await self.log_result("2. Debt Block on Favor Request", False, 
                    f"Wrong block message: '{error_msg}' (expected: '{expected_message}')")
                return False
        else:
            await self.log_result("2. Debt Block on Favor Request", False, 
                f"Expected 403 block, got: {response}")
            return False

    async def test_3_debt_recovery_endpoint(self):
        """Test 3: Test debt recovery from solidarity fund"""
        
        # Check current debt status
        success, debt_status = await self.make_request("GET", "/debt-status")
        if not success or not debt_status.get("in_debt"):
            await self.log_result("3. Debt Recovery Setup", False, 
                "User not in debt - cannot test recovery")
            return False
        
        current_granelli = debt_status.get("granelli", 0)
        print(f"    Current debt: {current_granelli} granelli")
        
        # Try debt recovery
        success, response = await self.make_request("POST", "/debt-recovery/request")
        
        if success:
            # Check response structure
            expected_fields = ["success", "amount_received", "new_balance", "returned_positive", "message"]
            missing_fields = [field for field in expected_fields if field not in response]
            
            if missing_fields:
                await self.log_result("3. Debt Recovery Response", False, 
                    f"Missing response fields: {missing_fields}")
                return False
            
            amount_received = response.get("amount_received", 0)
            new_balance = response.get("new_balance", 0)
            returned_positive = response.get("returned_positive", False)
            
            # Verify recovery logic
            expected_recovery = min(abs(current_granelli), 3)  # Max 3 granelli per recovery
            expected_new_balance = current_granelli + amount_received
            
            if amount_received == expected_recovery and new_balance == expected_new_balance:
                await self.log_result("3. Debt Recovery Endpoint", True, 
                    f"Recovered {amount_received} granelli, new balance: {new_balance}, returned_positive: {returned_positive}")
                
                # Check that in_debt_recovery flag is set
                success2, debt_status2 = await self.make_request("GET", "/debt-status")
                if success2 and debt_status2.get("in_debt_recovery"):
                    print("    ✅ in_debt_recovery flag correctly set")
                    return True
                else:
                    await self.log_result("3. Debt Recovery Flag", False, 
                        "in_debt_recovery flag not set correctly")
                    return False
            else:
                await self.log_result("3. Debt Recovery Endpoint", False, 
                    f"Incorrect recovery: got {amount_received}, expected {expected_recovery}")
                return False
        else:
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            # Check if it's a valid error (insufficient fund, already in recovery)
            if "insufficiente" in error_msg or "già una richiesta" in error_msg:
                await self.log_result("3. Debt Recovery Endpoint", True, 
                    f"Valid error response: {error_msg}")
                return True
            else:
                await self.log_result("3. Debt Recovery Endpoint", False, 
                    f"Debt recovery failed: {response}")
                return False

    async def test_4_creator_in_debt_flag(self):
        """Test 4: Verify creator_in_debt flag is set when user in debt creates offers"""
        
        # Create an offer while in debt
        debt_offer = {
            "type": "offer",
            "title": "Aiuto con computer (urgente)",
            "description": "Offro aiuto con problemi computer - sono in difficoltà economica",
            "category": "Tecnologia", 
            "duration_hours": 1.5,
            "latitude": 41.8902,
            "longitude": 12.4922,
            "address": "Via della Solidarietà, Roma"
        }
        
        success, response = await self.make_request("POST", "/favors", debt_offer)
        
        if success:
            creator_in_debt = response.get("creator_in_debt", False)
            
            if creator_in_debt is True:
                await self.log_result("4. Creator In Debt Flag", True, 
                    f"creator_in_debt correctly set to {creator_in_debt} for debt user offer")
                
                # Store favor_id to check in favors list
                favor_id = response.get("favor_id")
                
                # Verify it shows in favors list with the flag
                success2, favors_list = await self.make_request("GET", "/favors")
                if success2:
                    created_favor = next((f for f in favors_list if f.get('favor_id') == favor_id), None)
                    if created_favor and created_favor.get('creator_in_debt') is True:
                        print("    ✅ creator_in_debt flag visible in favors list")
                        return True
                    else:
                        await self.log_result("4. Creator In Debt in List", False, 
                            "creator_in_debt flag not visible in favors list")
                        return False
                else:
                    await self.log_result("4. Creator In Debt Verification", False, 
                        "Could not retrieve favors list to verify flag")
                    return False
            else:
                await self.log_result("4. Creator In Debt Flag", False, 
                    f"creator_in_debt incorrectly set to {creator_in_debt} (should be True)")
                return False
        else:
            await self.log_result("4. Creator In Debt Flag", False, 
                f"Failed to create offer while in debt: {response}")
            return False

    async def test_5_reliability_score_system(self):
        """Test 5: Verify reliability score is properly tracked"""
        
        success, user_response = await self.make_request("GET", "/auth/me")
        
        if success:
            reliability_score = user_response.get("reliability_score", 0)
            debt_start_date = user_response.get("debt_start_date")
            last_activity_date = user_response.get("last_activity_date")
            
            if reliability_score == 5.0:
                await self.log_result("5. Reliability Score System", True, 
                    f"Reliability score: {reliability_score} (correct initial value)")
                
                # Check debt tracking fields exist
                if "debt_start_date" in user_response and "last_activity_date" in user_response:
                    print("    ✅ Debt tracking fields present")
                    return True
                else:
                    await self.log_result("5. Debt Tracking Fields", False, 
                        "Missing debt_start_date or last_activity_date fields")
                    return False
            else:
                await self.log_result("5. Reliability Score System", False, 
                    f"Incorrect reliability score: {reliability_score} (expected 5.0)")
                return False
        else:
            await self.log_result("5. Reliability Score System", False, 
                f"Failed to get user info: {user_response}")
            return False

    async def test_6_debt_recovery_restrictions(self):
        """Test 6: Verify debt recovery restrictions (max 3 granelli, no double recovery)"""
        
        # Try to request recovery again (should fail if already in recovery)
        success, response = await self.make_request("POST", "/debt-recovery/request")
        
        if not success:
            error_details = response.get("response_json", {})
            error_msg = error_details.get('detail', '') if error_details else ''
            
            if "già una richiesta" in error_msg or "already" in error_msg.lower():
                await self.log_result("6. Double Recovery Prevention", True, 
                    f"Correctly prevented double recovery: {error_msg}")
                return True
            elif "Non sei in debito" in error_msg:
                await self.log_result("6. Recovery When Not In Debt", True, 
                    f"Correctly blocked recovery when not in debt: {error_msg}")
                return True
            else:
                await self.log_result("6. Debt Recovery Restrictions", False, 
                    f"Unexpected error: {error_msg}")
                return False
        else:
            # If successful, check that it only gave max 3 granelli
            amount_received = response.get("amount_received", 0)
            if amount_received <= 3:
                await self.log_result("6. Max Recovery Amount", True, 
                    f"Recovery amount {amount_received} ≤ 3 granelli (correct limit)")
                return True
            else:
                await self.log_result("6. Max Recovery Amount", False, 
                    f"Recovery amount {amount_received} > 3 granelli (exceeds limit)")
                return False

    # ======================== MAIN TEST RUNNER ========================

    async def run_debt_tests(self):
        """Run all social debt limit tests in sequence"""
        print("🚀 Testing SOCIAL DEBT LIMIT SYSTEM - Scambio di Favori Backend")
        print(f"📡 API Base URL: {API_BASE_URL}")
        print("=" * 70)

        # Setup
        if not await self.setup_test_user():
            print("❌ Cannot proceed without test user")
            return False

        # Test the debt system
        print("\n🧪 TESTING SOCIAL DEBT LIMIT FEATURES:")
        await self.test_1_initial_debt_status()
        await self.test_2_debt_block_on_favor_request()
        await self.test_3_debt_recovery_endpoint()
        await self.test_4_creator_in_debt_flag()
        await self.test_5_reliability_score_system()
        await self.test_6_debt_recovery_restrictions()

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
        return self.results['failed'] == 0

async def main():
    """Main entry point"""
    tester = SocialDebtAPITester()
    
    try:
        success = await tester.run_debt_tests()
        
        if success:
            print("\n🎉 ALL SOCIAL DEBT LIMIT TESTS PASSED!")
            sys.exit(0)
        else:
            print("\n⚠️ SOME SOCIAL DEBT LIMIT TESTS FAILED")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n💥 Testing failed with error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())