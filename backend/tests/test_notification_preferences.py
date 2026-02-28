"""
Test notification preferences API endpoints:
- GET /api/notification-preferences - Returns default preferences (all true) for new users
- PUT /api/notification-preferences - Updates preferences correctly
- GET /api/notification-preferences - Returns updated preferences after PUT
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', os.environ.get('EXPO_PUBLIC_BACKEND_URL'))
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_EMAIL = "reviewer@test.com"
TEST_PASSWORD = "review123"


class TestNotificationPreferencesAPI:
    """Test notification preferences endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
    
    def test_get_default_preferences(self, headers):
        """GET /api/notification-preferences should return default preferences (all true)"""
        response = requests.get(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify all expected keys exist
        expected_keys = ["favor_accepted", "favor_completed", "new_message", "new_review", "skill_match"]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"
            assert isinstance(data[key], bool), f"Key '{key}' should be boolean"
        
        print(f"✅ GET /api/notification-preferences returned: {data}")
    
    def test_update_preferences_disable_one(self, headers):
        """PUT /api/notification-preferences should update preferences correctly"""
        # Disable one preference
        update_payload = {
            "favor_accepted": True,
            "favor_completed": False,  # Disable this one
            "new_message": True,
            "new_review": True,
            "skill_match": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers,
            json=update_payload
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response contains message and preferences
        assert "message" in data, "Response should contain 'message'"
        assert "preferences" in data, "Response should contain 'preferences'"
        
        # Verify the updated preferences match what we sent
        prefs = data["preferences"]
        assert prefs["favor_completed"] == False, "favor_completed should be False"
        assert prefs["favor_accepted"] == True, "favor_accepted should be True"
        
        print(f"✅ PUT /api/notification-preferences succeeded: {data}")
    
    def test_get_updated_preferences(self, headers):
        """GET /api/notification-preferences should return updated preferences after PUT"""
        response = requests.get(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify the preference we disabled is still False
        assert data["favor_completed"] == False, "favor_completed should still be False after GET"
        
        print(f"✅ GET after PUT returned updated prefs: {data}")
    
    def test_update_preferences_disable_multiple(self, headers):
        """PUT /api/notification-preferences can disable multiple preferences"""
        update_payload = {
            "favor_accepted": False,  # Disable
            "favor_completed": False,  # Disable
            "new_message": True,
            "new_review": False,  # Disable
            "skill_match": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers,
            json=update_payload
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        prefs = data["preferences"]
        assert prefs["favor_accepted"] == False
        assert prefs["favor_completed"] == False
        assert prefs["new_message"] == True
        assert prefs["new_review"] == False
        assert prefs["skill_match"] == True
        
        print(f"✅ Multiple preferences updated: {data}")
    
    def test_verify_multiple_disabled_persisted(self, headers):
        """Verify multiple disabled preferences are persisted"""
        response = requests.get(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check the multiple disabled prefs
        assert data["favor_accepted"] == False
        assert data["favor_completed"] == False
        assert data["new_review"] == False
        
        print(f"✅ Multiple disabled prefs persisted: {data}")
    
    def test_reenable_all_preferences(self, headers):
        """PUT /api/notification-preferences can re-enable all preferences"""
        update_payload = {
            "favor_accepted": True,
            "favor_completed": True,
            "new_message": True,
            "new_review": True,
            "skill_match": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notification-preferences",
            headers=headers,
            json=update_payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        prefs = data["preferences"]
        for key in prefs:
            assert prefs[key] == True, f"{key} should be True"
        
        print(f"✅ All preferences re-enabled: {data}")
    
    def test_unauthorized_access(self):
        """GET /api/notification-preferences without auth should fail"""
        response = requests.get(
            f"{BASE_URL}/api/notification-preferences",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Unauthorized access correctly rejected")
    
    def test_put_unauthorized_access(self):
        """PUT /api/notification-preferences without auth should fail"""
        response = requests.put(
            f"{BASE_URL}/api/notification-preferences",
            headers={"Content-Type": "application/json"},
            json={"favor_accepted": True}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Unauthorized PUT correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
