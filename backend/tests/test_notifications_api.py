"""
Test suite for Notifications API endpoints
Tests: GET /api/notifications, GET /api/notifications/unread-count, POST /api/notifications/read/{id}
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://granelli-app-1.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "reviewer@test.com"
TEST_USER_PASSWORD = "review123"

class TestNotificationsAPI:
    """Notifications API endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
    
    def test_health_check(self):
        """Test backend is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("Health check PASSED")
    
    # ==================
    # GET /api/notifications
    # ==================
    
    def test_get_notifications_success(self, auth_headers):
        """Test getting notifications list"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"GET /api/notifications PASSED - Got {len(data)} notifications")
        return data
    
    def test_get_notifications_without_auth(self):
        """Test that notifications require authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 401, "Should require authentication"
        print("GET /api/notifications without auth returns 401 - PASSED")
    
    def test_get_notifications_with_invalid_token(self):
        """Test with invalid token"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid_token_12345"
        }
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 401, "Should reject invalid token"
        print("GET /api/notifications with invalid token returns 401 - PASSED")
    
    # ==================
    # GET /api/notifications/unread-count
    # ==================
    
    def test_get_unread_count_success(self, auth_headers):
        """Test getting unread notifications count"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/unread-count",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get unread count failed: {response.text}"
        data = response.json()
        assert "unread_count" in data, "Response should contain 'unread_count'"
        assert isinstance(data["unread_count"], int), "unread_count should be an integer"
        assert data["unread_count"] >= 0, "unread_count should be non-negative"
        print(f"GET /api/notifications/unread-count PASSED - Count: {data['unread_count']}")
    
    def test_get_unread_count_without_auth(self):
        """Test that unread count requires authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 401, "Should require authentication"
        print("GET /api/notifications/unread-count without auth returns 401 - PASSED")
    
    # ==================
    # POST /api/notifications/read/{notification_id}
    # ==================
    
    def test_mark_notification_read_invalid_id(self, auth_headers):
        """Test marking a non-existent notification as read"""
        fake_id = "notif_nonexistent123"
        response = requests.post(
            f"{BASE_URL}/api/notifications/read/{fake_id}",
            headers=auth_headers
        )
        # Should return 200 (no-op for non-existent) or 404 depending on implementation
        # Based on the code, it does update_one which doesn't error on no match
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"POST /api/notifications/read/{fake_id} returns {response.status_code} - PASSED")
    
    def test_mark_notification_read_without_auth(self):
        """Test that marking read requires authentication"""
        response = requests.post(f"{BASE_URL}/api/notifications/read/some_id")
        assert response.status_code == 401, "Should require authentication"
        print("POST /api/notifications/read without auth returns 401 - PASSED")


class TestSupporterBadgeInFavorsAPI:
    """Test that favors API returns creator_is_supporter field"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
    
    def test_favors_list_contains_creator_is_supporter(self, auth_headers):
        """Test GET /api/favors returns creator_is_supporter field"""
        response = requests.get(
            f"{BASE_URL}/api/favors?status=active",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get favors failed: {response.text}"
        data = response.json()
        
        if len(data) > 0:
            # Check first favor has creator_is_supporter field
            first_favor = data[0]
            assert "creator_is_supporter" in first_favor, "Favor should have creator_is_supporter field"
            assert isinstance(first_favor["creator_is_supporter"], bool), "creator_is_supporter should be boolean"
            print(f"GET /api/favors contains creator_is_supporter field - PASSED (first: {first_favor.get('creator_is_supporter')})")
        else:
            print("GET /api/favors returned empty list - Cannot verify creator_is_supporter")
    
    def test_favor_detail_contains_creator_is_supporter(self, auth_headers):
        """Test GET /api/favors/{id} returns creator_is_supporter field"""
        # First get a list of favors
        response = requests.get(
            f"{BASE_URL}/api/favors?status=active",
            headers=auth_headers
        )
        assert response.status_code == 200
        favors = response.json()
        
        if len(favors) > 0:
            favor_id = favors[0]["favor_id"]
            response = requests.get(
                f"{BASE_URL}/api/favors/{favor_id}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Get favor detail failed: {response.text}"
            favor = response.json()
            assert "creator_is_supporter" in favor, "Favor detail should have creator_is_supporter"
            print(f"GET /api/favors/{favor_id} contains creator_is_supporter - PASSED")
        else:
            print("No favors available - Skipping detail test")


class TestCategoriesAPI:
    """Test categories endpoint for skeleton loader context"""
    
    def test_get_categories(self):
        """Test GET /api/categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Get categories failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Categories should be a list"
        assert len(data) > 0, "Should have at least one category"
        
        # Verify category structure
        first_cat = data[0]
        assert "name" in first_cat, "Category should have name"
        assert "icon" in first_cat, "Category should have icon"
        print(f"GET /api/categories PASSED - Got {len(data)} categories")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
