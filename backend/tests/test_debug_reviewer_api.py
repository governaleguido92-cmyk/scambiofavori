"""
Test module for Debug/Reviewer features and SupporterBadge-related backend APIs
Testing:
1. GET /api/favors - creator_is_supporter field
2. GET /api/debug/is-reviewer - reviewer status check
3. POST /api/debug/mock-qr-scan - mock QR completion for reviewer
4. User model - is_supporter field
5. Backend health check
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://granelli-hub.preview.emergentagent.com').rstrip('/')

# Test credentials
REVIEWER_EMAIL = "reviewer@test.com"
REVIEWER_PASSWORD = "review123"
REGULAR_USER_EMAIL = "test_debug_user@test.com"
REGULAR_USER_PASSWORD = "test123"


class TestHealthCheck:
    """Backend health check"""
    
    def test_health_check(self):
        """Test backend health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")


class TestUserModel:
    """Test User model includes is_supporter field"""
    
    @pytest.fixture
    def reviewer_token(self):
        """Login as reviewer account"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        # If reviewer doesn't exist, create it
        if response.status_code == 401:
            register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": REVIEWER_EMAIL,
                "password": REVIEWER_PASSWORD,
                "name": "Reviewer Account"
            })
            if register_response.status_code == 200:
                return register_response.json().get("token")
            # Try login again in case account exists but with different password
            login_retry = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": REVIEWER_EMAIL,
                "password": REVIEWER_PASSWORD
            })
            if login_retry.status_code == 200:
                return login_retry.json().get("token")
        pytest.skip("Could not authenticate as reviewer")
    
    def test_user_model_has_is_supporter_field(self, reviewer_token):
        """Test that User model includes is_supporter field"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {reviewer_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check is_supporter field exists
        assert "is_supporter" in data, "is_supporter field missing from User model"
        assert isinstance(data["is_supporter"], bool), "is_supporter should be boolean"
        print(f"✓ User model contains is_supporter field: {data['is_supporter']}")
        
        # Check other expected fields
        expected_fields = ["user_id", "email", "name", "granelli", "badges", "title"]
        for field in expected_fields:
            assert field in data, f"Expected field {field} missing from User model"
        print("✓ User model structure verified")


class TestDebugReviewerEndpoints:
    """Test debug/reviewer endpoints"""
    
    @pytest.fixture
    def reviewer_token(self):
        """Login as reviewer account"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        # Try to create reviewer account
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD,
            "name": "Reviewer Account"
        })
        if register_response.status_code == 200:
            return register_response.json().get("token")
        pytest.skip("Could not authenticate as reviewer")
    
    @pytest.fixture
    def regular_user_token(self):
        """Login as regular user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        # Try to register
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD,
            "name": "Regular Test User"
        })
        if register_response.status_code == 200:
            return register_response.json().get("token")
        pytest.skip("Could not authenticate as regular user")
    
    def test_is_reviewer_requires_auth(self):
        """Test that /api/debug/is-reviewer requires authentication"""
        response = requests.get(f"{BASE_URL}/api/debug/is-reviewer")
        assert response.status_code == 401
        print("✓ is-reviewer endpoint requires authentication")
    
    def test_is_reviewer_returns_true_for_reviewer_account(self, reviewer_token):
        """Test that reviewer account is identified correctly"""
        response = requests.get(f"{BASE_URL}/api/debug/is-reviewer", headers={
            "Authorization": f"Bearer {reviewer_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "is_reviewer" in data
        assert data["is_reviewer"] == True, "reviewer@test.com should be marked as reviewer"
        assert "debug_features_enabled" in data
        assert "features" in data
        
        # Check features list for reviewer
        if data["debug_features_enabled"]:
            assert "mock_qr_scan" in data["features"]
        
        print(f"✓ Reviewer status: is_reviewer={data['is_reviewer']}, features={data['features']}")
    
    def test_is_reviewer_returns_false_for_regular_user(self, regular_user_token):
        """Test that regular user is not marked as reviewer"""
        response = requests.get(f"{BASE_URL}/api/debug/is-reviewer", headers={
            "Authorization": f"Bearer {regular_user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_reviewer"] == False, "Regular user should not be marked as reviewer"
        assert data["features"] == [], "Regular user should have no debug features"
        print(f"✓ Regular user is_reviewer={data['is_reviewer']}")


class TestMockQRScan:
    """Test mock QR scan endpoint for reviewer accounts"""
    
    @pytest.fixture
    def reviewer_token(self):
        """Login as reviewer account"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD,
            "name": "Reviewer Account"
        })
        if register_response.status_code == 200:
            return register_response.json().get("token")
        pytest.skip("Could not authenticate as reviewer")
    
    @pytest.fixture
    def regular_user_token(self):
        """Login as regular user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD,
            "name": "Regular Test User"
        })
        if register_response.status_code == 200:
            return register_response.json().get("token")
        pytest.skip("Could not authenticate as regular user")
    
    def test_mock_qr_scan_requires_auth(self):
        """Test that mock-qr-scan requires authentication"""
        response = requests.post(f"{BASE_URL}/api/debug/mock-qr-scan?favor_id=test123")
        assert response.status_code == 401
        print("✓ mock-qr-scan endpoint requires authentication")
    
    def test_mock_qr_scan_invalid_favor(self, reviewer_token):
        """Test mock-qr-scan with non-existent favor"""
        response = requests.post(
            f"{BASE_URL}/api/debug/mock-qr-scan?favor_id=nonexistent_favor",
            headers={"Authorization": f"Bearer {reviewer_token}"}
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ mock-qr-scan returns 404 for invalid favor: {data['detail']}")
    
    def test_mock_qr_scan_full_flow(self, reviewer_token, regular_user_token):
        """Test complete mock QR scan flow for reviewer"""
        # Step 1: Create a favor as reviewer
        favor_data = {
            "type": "offer",
            "title": "TEST Mock QR Scan Favor",
            "description": "Testing mock QR completion",
            "category": "Tecnologia",
            "duration_hours": 1.0
        }
        create_response = requests.post(
            f"{BASE_URL}/api/favors",
            headers={"Authorization": f"Bearer {reviewer_token}"},
            json=favor_data
        )
        assert create_response.status_code == 200, f"Failed to create favor: {create_response.text}"
        favor = create_response.json()
        favor_id = favor["favor_id"]
        print(f"✓ Created test favor: {favor_id}")
        
        # Step 2: Accept favor as regular user
        accept_response = requests.post(
            f"{BASE_URL}/api/favors/accept",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json={"favor_id": favor_id}
        )
        assert accept_response.status_code == 200, f"Failed to accept favor: {accept_response.text}"
        print(f"✓ Favor accepted by regular user")
        
        # Step 3: Use mock QR scan to complete (as reviewer - creator)
        mock_response = requests.post(
            f"{BASE_URL}/api/debug/mock-qr-scan?favor_id={favor_id}",
            headers={"Authorization": f"Bearer {reviewer_token}"}
        )
        assert mock_response.status_code == 200, f"Mock QR scan failed: {mock_response.text}"
        data = mock_response.json()
        
        assert data["debug_mode"] == True
        assert data["favor_id"] == favor_id
        assert "granelli_transferred" in data
        assert "message" in data
        print(f"✓ Mock QR scan completed: {data}")
        
        # Step 4: Verify favor is now completed
        get_response = requests.get(
            f"{BASE_URL}/api/favors/{favor_id}",
            headers={"Authorization": f"Bearer {reviewer_token}"}
        )
        assert get_response.status_code == 200
        updated_favor = get_response.json()
        assert updated_favor["status"] == "completed"
        print(f"✓ Favor status verified as 'completed'")


class TestFavorsCreatorIsSupporter:
    """Test GET /api/favors returns creator_is_supporter field"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD,
            "name": "Reviewer Account"
        })
        if register_response.status_code == 200:
            return register_response.json().get("token")
        pytest.skip("Could not authenticate")
    
    def test_favors_endpoint_includes_creator_is_supporter(self):
        """Test that GET /api/favors returns creator_is_supporter field"""
        response = requests.get(f"{BASE_URL}/api/favors")
        assert response.status_code == 200
        favors = response.json()
        
        if len(favors) == 0:
            pytest.skip("No favors to test - create a favor first")
        
        # Check first favor has creator_is_supporter field
        first_favor = favors[0]
        assert "creator_is_supporter" in first_favor, "creator_is_supporter field missing from favor"
        assert isinstance(first_favor["creator_is_supporter"], bool), "creator_is_supporter should be boolean"
        print(f"✓ GET /api/favors includes creator_is_supporter field")
        print(f"  Sample favor: creator_is_supporter={first_favor['creator_is_supporter']}")
    
    def test_new_favor_has_creator_is_supporter_field(self, auth_token):
        """Test that newly created favor includes creator_is_supporter"""
        favor_data = {
            "type": "offer",
            "title": "TEST Creator Supporter Field Check",
            "description": "Testing creator_is_supporter field",
            "category": "Consiglio",
            "duration_hours": 0.5
        }
        create_response = requests.post(
            f"{BASE_URL}/api/favors",
            headers={"Authorization": f"Bearer {auth_token}"},
            json=favor_data
        )
        assert create_response.status_code == 200
        favor = create_response.json()
        
        # Check that favor has creator_is_supporter field
        # Note: New favor might not have this in response, but GET should include it
        favor_id = favor["favor_id"]
        
        # Fetch via GET /api/favors to verify the field
        list_response = requests.get(f"{BASE_URL}/api/favors")
        assert list_response.status_code == 200
        favors = list_response.json()
        
        # Find our favor
        our_favor = next((f for f in favors if f["favor_id"] == favor_id), None)
        if our_favor:
            assert "creator_is_supporter" in our_favor
            print(f"✓ New favor has creator_is_supporter: {our_favor['creator_is_supporter']}")
        else:
            print("⚠ Created favor not found in list (might be filtered)")
        
        # Cleanup - optional delete
        requests.delete(
            f"{BASE_URL}/api/favors/{favor_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestAPIStructureValidation:
    """Validate API response structures"""
    
    def test_categories_endpoint(self):
        """Test categories endpoint works"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        if len(categories) > 0:
            assert "name" in categories[0]
            assert "icon" in categories[0]
        print(f"✓ Categories endpoint returns {len(categories)} categories")
    
    def test_badges_endpoint(self):
        """Test badges endpoint works"""
        response = requests.get(f"{BASE_URL}/api/badges")
        assert response.status_code == 200
        badges = response.json()
        assert isinstance(badges, list)
        print(f"✓ Badges endpoint returns {len(badges)} badges")
    
    def test_currency_info_endpoint(self):
        """Test currency info endpoint"""
        response = requests.get(f"{BASE_URL}/api/currency")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "symbol" in data
        print(f"✓ Currency info: {data['name']} ({data['symbol']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
