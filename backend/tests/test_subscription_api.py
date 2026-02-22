"""
Test file for Supporter Subscription System ("Pilastro della Community")
Tests all subscription-related APIs including:
- GET /api/subscription/my-status
- POST /api/subscription/create-checkout
- GET /api/subscription/status/{session_id}
- GET /api/subscription/manage-url
- POST /api/webhook/stripe
"""

import pytest
import requests
import os

# Use public URL for testing - same as user sees
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://community-trades-2.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "skills_test@test.com"
TEST_USER_PASSWORD = "test123"


class TestSubscriptionAuth:
    """Test authentication requirements for subscription endpoints"""
    
    def test_my_status_requires_auth(self):
        """GET /api/subscription/my-status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/subscription/my-status")
        assert response.status_code == 401
        assert "Non autenticato" in response.json().get("detail", "")
    
    def test_create_checkout_requires_auth(self):
        """POST /api/subscription/create-checkout requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/create-checkout",
            json={"origin_url": "https://test.com"}
        )
        assert response.status_code == 401
        assert "Non autenticato" in response.json().get("detail", "")
    
    def test_manage_url_requires_auth(self):
        """GET /api/subscription/manage-url requires authentication"""
        response = requests.get(f"{BASE_URL}/api/subscription/manage-url")
        assert response.status_code == 401


class TestSubscriptionEndpoints:
    """Test subscription endpoints with authenticated user"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for test user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Could not authenticate test user: {response.text}")
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        """Get auth headers for requests"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_my_subscription_status_success(self, auth_headers):
        """GET /api/subscription/my-status returns user's subscription status"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/my-status",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert "is_supporter" in data
        assert "subscription_status" in data
        assert "supporter_since" in data
        assert "subscription_id" in data
        
        # Verify data types
        assert isinstance(data["is_supporter"], bool)
        print(f"✓ User subscription status: is_supporter={data['is_supporter']}")
    
    def test_create_checkout_success(self, auth_headers):
        """POST /api/subscription/create-checkout creates Stripe checkout session"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/create-checkout",
            headers=auth_headers,
            json={"origin_url": "https://community-trades-2.preview.emergentagent.com"}
        )
        
        # Could be 200 (checkout created) or 400 (already supporter)
        assert response.status_code in [200, 400]
        
        data = response.json()
        
        if response.status_code == 200:
            # Verify checkout response structure
            assert "checkout_url" in data
            assert "session_id" in data
            assert data["checkout_url"] is not None
            assert data["session_id"] is not None
            # Stripe checkout URLs typically start with checkout.stripe.com
            assert "stripe" in data["checkout_url"].lower() or "http" in data["checkout_url"]
            print(f"✓ Checkout URL created: {data['checkout_url'][:50]}...")
            print(f"✓ Session ID: {data['session_id']}")
        else:
            # User is already a supporter
            assert "Sostenitore" in data.get("detail", "")
            print(f"✓ User already a supporter: {data['detail']}")
    
    def test_create_checkout_validates_origin_url(self, auth_headers):
        """POST /api/subscription/create-checkout requires origin_url"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/create-checkout",
            headers=auth_headers,
            json={}  # Missing origin_url
        )
        # Should fail validation
        assert response.status_code == 422
    
    def test_get_checkout_status_nonexistent(self, auth_headers):
        """GET /api/subscription/status/{session_id} with invalid session returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status/invalid_session_123",
            headers=auth_headers
        )
        assert response.status_code == 404
        assert "non trovata" in response.json().get("detail", "")
    
    def test_manage_url_not_supporter(self, auth_headers):
        """GET /api/subscription/manage-url for non-supporter returns 400"""
        # First check if user is supporter
        status_response = requests.get(
            f"{BASE_URL}/api/subscription/my-status",
            headers=auth_headers
        )
        is_supporter = status_response.json().get("is_supporter", False)
        
        response = requests.get(
            f"{BASE_URL}/api/subscription/manage-url",
            headers=auth_headers
        )
        
        if is_supporter:
            # If supporter, should return manage URL
            assert response.status_code == 200
            data = response.json()
            assert "manage_url" in data
            print(f"✓ Supporter manage URL: {data['manage_url']}")
        else:
            # If not supporter, should return 400
            assert response.status_code == 400
            assert "Sostenitore" in response.json().get("detail", "")
            print("✓ Non-supporter correctly denied manage URL access")


class TestStripeWebhook:
    """Test Stripe webhook endpoint"""
    
    def test_webhook_no_signature(self):
        """POST /api/webhook/stripe without signature should handle error"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/stripe",
            headers={"Content-Type": "application/json"},
            data='{"type": "test"}'
        )
        # Webhook should handle gracefully, not crash
        # Could return error status or 200 with error message
        assert response.status_code in [200, 400, 500]
        print(f"✓ Webhook handled request: status={response.status_code}")
    
    def test_webhook_with_invalid_body(self):
        """POST /api/webhook/stripe with invalid body"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/stripe",
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": "test_signature"
            },
            data='{"type": "checkout.session.completed", "data": {}}'
        )
        # Should handle gracefully
        assert response.status_code in [200, 400, 500]
        data = response.json()
        # Should have status field in response
        assert "status" in data
        print(f"✓ Webhook response status: {data.get('status')}")


class TestSubscriptionFlow:
    """Test the complete subscription flow"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Could not authenticate: {response.text}")
        return response.json().get("token")
    
    def test_full_subscription_flow(self, auth_token):
        """Test complete subscription flow: check status -> create checkout -> verify session"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Step 1: Check initial status
        status_resp = requests.get(f"{BASE_URL}/api/subscription/my-status", headers=headers)
        assert status_resp.status_code == 200
        initial_status = status_resp.json()
        print(f"Step 1: Initial status - is_supporter={initial_status['is_supporter']}")
        
        # Step 2: Create checkout session (if not already supporter)
        if not initial_status["is_supporter"]:
            checkout_resp = requests.post(
                f"{BASE_URL}/api/subscription/create-checkout",
                headers=headers,
                json={"origin_url": "https://community-trades-2.preview.emergentagent.com"}
            )
            assert checkout_resp.status_code == 200
            checkout_data = checkout_resp.json()
            session_id = checkout_data["session_id"]
            print(f"Step 2: Checkout created - session_id={session_id}")
            
            # Step 3: Check session status (should be pending/unpaid)
            session_resp = requests.get(
                f"{BASE_URL}/api/subscription/status/{session_id}",
                headers=headers
            )
            assert session_resp.status_code == 200
            session_data = session_resp.json()
            print(f"Step 3: Session status - payment_status={session_data.get('payment_status')}, status={session_data.get('status')}")
            
            # Verify session data structure
            assert "status" in session_data
            assert "payment_status" in session_data
        else:
            print("Step 2-3: Skipped - User is already a supporter")
            
        # Step 4: Verify manage URL access based on supporter status
        manage_resp = requests.get(f"{BASE_URL}/api/subscription/manage-url", headers=headers)
        if initial_status["is_supporter"]:
            assert manage_resp.status_code == 200
            print(f"Step 4: Manage URL accessible for supporter")
        else:
            assert manage_resp.status_code == 400
            print(f"Step 4: Manage URL correctly blocked for non-supporter")


class TestUserModelUpdates:
    """Test that user model is correctly updated with supporter fields"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Could not authenticate: {response.text}")
        return response.json().get("token")
    
    def test_user_me_contains_supporter_fields(self, auth_token):
        """GET /api/auth/me should include supporter-related fields in response"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        user_data = response.json()
        
        # Check that badges field exists (supporter badge would be here)
        assert "badges" in user_data
        assert isinstance(user_data["badges"], list)
        
        print(f"✓ User badges: {user_data['badges']}")
        print(f"✓ User has {len(user_data['badges'])} badges")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
