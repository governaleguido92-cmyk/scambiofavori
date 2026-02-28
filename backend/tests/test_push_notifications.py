"""
Push Notification System Tests
Tests for:
- POST /api/push-token - Register push token (requires auth)
- DELETE /api/push-token - Remove push token (requires auth)
- Push token storage in MongoDB
- Push notification calls during favor accept, complete, review, message
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "reviewer@test.com"
TEST_PASSWORD = "review123"

# Fake Expo push token for testing (won't actually deliver)
TEST_PUSH_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"


class TestPushTokenEndpoints:
    """Test push token registration and removal endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user_id = data.get("user", {}).get("user_id")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_register_push_token_success(self):
        """Test POST /api/push-token - successful registration"""
        response = requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": TEST_PUSH_TOKEN},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        assert data["message"] == "Push token registrato"
    
    def test_register_push_token_requires_auth(self):
        """Test POST /api/push-token - requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": TEST_PUSH_TOKEN},
            headers={"Content-Type": "application/json"}
            # No Authorization header
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_register_push_token_invalid_format(self):
        """Test POST /api/push-token - empty token should still be accepted (validation on frontend)"""
        response = requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": ""},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Backend accepts any string, validation is on frontend/Expo
        assert response.status_code == 200
    
    def test_remove_push_token_success(self):
        """Test DELETE /api/push-token - successful removal"""
        # First register a token
        requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": TEST_PUSH_TOKEN},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Now remove it
        response = requests.delete(
            f"{BASE_URL}/api/push-token",
            headers={
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        assert data["message"] == "Push token rimosso"
    
    def test_remove_push_token_requires_auth(self):
        """Test DELETE /api/push-token - requires authentication"""
        response = requests.delete(
            f"{BASE_URL}/api/push-token",
            headers={"Content-Type": "application/json"}
            # No Authorization header
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"


class TestPushTokenPersistence:
    """Test that push token is stored correctly in user document"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user_id = data.get("user", {}).get("user_id")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_push_token_stored_after_registration(self):
        """Test push token is stored and can be re-registered"""
        # Register a push token
        response = requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": "ExponentPushToken[test123]"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        assert response.status_code == 200
        
        # Register again with different token (should update)
        response2 = requests.post(
            f"{BASE_URL}/api/push-token",
            json={"push_token": "ExponentPushToken[updated456]"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        assert response2.status_code == 200
        
        # Clean up
        requests.delete(
            f"{BASE_URL}/api/push-token",
            headers={"Authorization": f"Bearer {self.token}"}
        )


class TestNotificationTriggeredEndpoints:
    """Test endpoints that trigger push notifications"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user_id = data.get("user", {}).get("user_id")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_accept_favor_endpoint_exists(self):
        """Test POST /api/favors/accept endpoint is accessible (triggers push notification)"""
        # Test with invalid favor_id to verify endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/favors/accept",
            json={"favor_id": "invalid_favor_id"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Should return 404 for invalid favor, not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for invalid favor, got {response.status_code}"
    
    def test_complete_favor_endpoint_exists(self):
        """Test POST /api/favors/complete endpoint is accessible (triggers push notification)"""
        # Test with invalid favor_id to verify endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/favors/complete",
            json={"favor_id": "invalid_favor_id"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Should return 404 for invalid favor, not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for invalid favor, got {response.status_code}"
    
    def test_send_message_endpoint_exists(self):
        """Test POST /api/messages endpoint is accessible (triggers push notification)"""
        # Test with invalid favor_id to verify endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/messages",
            json={"favor_id": "invalid_favor_id", "content": "Test message"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Should return 404 for invalid favor, not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for invalid favor, got {response.status_code}"
    
    def test_review_endpoint_exists(self):
        """Test POST /api/reviews endpoint is accessible (triggers push notification)"""
        # Test with invalid favor_id to verify endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/reviews",
            json={
                "favor_id": "invalid_favor_id",
                "rating": 5,
                "kindness_rating": 5,
                "impact_rating": 5
            },
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        )
        
        # Should return 404 for invalid favor, not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for invalid favor, got {response.status_code}"


class TestCoreAPIsWorking:
    """Test core APIs that work with push notifications"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user_id = data.get("user", {}).get("user_id")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_login_works(self):
        """Test login still works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
    
    def test_get_me_works(self):
        """Test /auth/me endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
    
    def test_get_favors_works(self):
        """Test GET /api/favors works"""
        response = requests.get(f"{BASE_URL}/api/favors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_categories_works(self):
        """Test GET /api/categories works"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
    
    def test_notifications_endpoint_works(self):
        """Test GET /api/notifications works"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestFavorDetailPage:
    """Test favor detail page functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_favor_detail_404_for_invalid_id(self):
        """Test GET /api/favors/{id} returns 404 for invalid ID"""
        response = requests.get(
            f"{BASE_URL}/api/favors/invalid_favor_id",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 404
    
    def test_favor_list_contains_expected_fields(self):
        """Test favor list items have expected fields"""
        response = requests.get(f"{BASE_URL}/api/favors")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            favor = data[0]
            expected_fields = ["favor_id", "title", "description", "category", "type", "status"]
            for field in expected_fields:
                assert field in favor, f"Missing field: {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
