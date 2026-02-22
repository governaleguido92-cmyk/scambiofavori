"""
Store Compliance API Tests
Tests for:
- POST /api/report - segnalazione contenuti
- POST /api/users/block - blocco utente
- DELETE /api/users/block/{user_id} - sblocco utente
- GET /api/users/blocked - lista bloccati
- GET /api/users/me/profile-completion - barra completamento
- GET /api/debug/is-reviewer - verifica account reviewer
- POST /api/debug/mock-qr-scan - mock QR per reviewer
"""
import pytest
import requests
import os
import uuid

# API base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "skills_test@test.com"
TEST_USER_PASSWORD = "test123"
REVIEWER_EMAIL = "reviewer@test.com"
REVIEWER_PASSWORD = "review123"


class TestAuthentication:
    """Test user authentication for compliance tests"""
    
    def test_login_test_user(self):
        """Login with test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✓ Test user login successful: {data['user']['name']}")
    
    def test_login_reviewer_account(self):
        """Login with reviewer account (may need to create first)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        
        if response.status_code == 401:
            # Create reviewer account
            reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": REVIEWER_EMAIL,
                "password": REVIEWER_PASSWORD,
                "name": "Store Reviewer"
            })
            assert reg_response.status_code == 200, f"Reviewer registration failed: {reg_response.text}"
            print("✓ Created reviewer account")
            return
        
        assert response.status_code == 200, f"Reviewer login failed: {response.text}"
        print("✓ Reviewer login successful")


class TestReportEndpoint:
    """Test POST /api/report endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        return response.json()["token"]
    
    @pytest.fixture
    def second_user_token(self):
        """Create or get a second user for testing"""
        email = f"test_report_user_{uuid.uuid4().hex[:6]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "test123",
            "name": "Report Test User"
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not create second user")
    
    def test_report_requires_auth(self):
        """Report endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/report", json={
            "report_type": "user",
            "target_id": "some_user_id",
            "reason": "spam"
        })
        assert response.status_code == 401, "Expected 401 without auth"
        print("✓ Report endpoint requires authentication")
    
    def test_report_invalid_type(self, auth_token):
        """Report rejects invalid report types"""
        response = requests.post(
            f"{BASE_URL}/api/report",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "report_type": "invalid",
                "target_id": "some_id",
                "reason": "spam"
            }
        )
        assert response.status_code == 400
        print("✓ Report rejects invalid type")
    
    def test_report_user_not_self(self, auth_token):
        """Cannot report yourself"""
        # Get current user id
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        my_user_id = me_response.json()["user_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/report",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "report_type": "user",
                "target_id": my_user_id,
                "reason": "spam"
            }
        )
        assert response.status_code == 400
        print("✓ Cannot report yourself")
    
    def test_report_user_success(self, auth_token, second_user_token):
        """Successfully report a user"""
        target_user_id = second_user_token["user"]["user_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/report",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "report_type": "user",
                "target_id": target_user_id,
                "reason": "spam",
                "description": "Test report"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "report_id" in data
        assert "message" in data
        print(f"✓ User report submitted successfully: {data['report_id']}")
    
    def test_report_nonexistent_user(self, auth_token):
        """Report nonexistent user returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/report",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "report_type": "user",
                "target_id": "nonexistent_user_12345",
                "reason": "spam"
            }
        )
        assert response.status_code == 404
        print("✓ Report nonexistent user returns 404")


class TestBlockEndpoints:
    """Test user blocking endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        return response.json()["token"]
    
    @pytest.fixture
    def second_user(self):
        """Create a second user for blocking tests"""
        email = f"test_block_user_{uuid.uuid4().hex[:6]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "test123",
            "name": "Block Test User"
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not create second user")
    
    def test_block_requires_auth(self):
        """Block endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/users/block", json={
            "user_id": "some_user_id"
        })
        assert response.status_code == 401
        print("✓ Block endpoint requires authentication")
    
    def test_block_cannot_block_self(self, auth_token):
        """Cannot block yourself"""
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        my_user_id = me_response.json()["user_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/users/block",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"user_id": my_user_id}
        )
        assert response.status_code == 400
        print("✓ Cannot block yourself")
    
    def test_block_user_success(self, auth_token, second_user):
        """Successfully block a user"""
        target_user_id = second_user["user"]["user_id"]
        
        response = requests.post(
            f"{BASE_URL}/api/users/block",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "user_id": target_user_id,
                "reason": "Test block"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ User blocked successfully: {target_user_id}")
        
        # Verify in blocked list
        blocked_response = requests.get(
            f"{BASE_URL}/api/users/blocked",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert blocked_response.status_code == 200
        blocked_data = blocked_response.json()
        blocked_ids = [u["user_id"] for u in blocked_data.get("blocked_users", [])]
        assert target_user_id in blocked_ids, "Blocked user not in list"
        print("✓ Blocked user appears in blocked list")
        
        # Unblock for cleanup
        unblock_response = requests.delete(
            f"{BASE_URL}/api/users/block/{target_user_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert unblock_response.status_code == 200
        print("✓ User unblocked successfully")
    
    def test_block_nonexistent_user(self, auth_token):
        """Block nonexistent user returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/users/block",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"user_id": "nonexistent_user_12345"}
        )
        assert response.status_code == 404
        print("✓ Block nonexistent user returns 404")
    
    def test_unblock_nonexistent_block(self, auth_token):
        """Unblock nonexistent block returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/users/block/nonexistent_user_12345",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 404
        print("✓ Unblock nonexistent returns 404")
    
    def test_get_blocked_users_empty(self, auth_token):
        """Get blocked users (may be empty)"""
        response = requests.get(
            f"{BASE_URL}/api/users/blocked",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "blocked_users" in data
        assert isinstance(data["blocked_users"], list)
        print(f"✓ Get blocked users: {len(data['blocked_users'])} users")


class TestProfileCompletion:
    """Test profile completion endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        return response.json()["token"]
    
    def test_profile_completion_requires_auth(self):
        """Profile completion requires authentication"""
        response = requests.get(f"{BASE_URL}/api/users/me/profile-completion")
        assert response.status_code == 401
        print("✓ Profile completion requires authentication")
    
    def test_profile_completion_returns_data(self, auth_token):
        """Profile completion returns expected structure"""
        response = requests.get(
            f"{BASE_URL}/api/users/me/profile-completion",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate structure
        assert "percentage" in data
        assert "items" in data
        assert "completed_count" in data
        assert "total_count" in data
        
        # Validate percentage is number 0-100
        assert isinstance(data["percentage"], int)
        assert 0 <= data["percentage"] <= 100
        
        # Validate items structure
        assert isinstance(data["items"], list)
        for item in data["items"]:
            assert "id" in item
            assert "label" in item
            assert "completed" in item
            assert "points" in item
        
        print(f"✓ Profile completion: {data['percentage']}% ({data['completed_count']}/{data['total_count']})")
        print(f"  Items: {[i['id'] for i in data['items']]}")


class TestReviewerDebug:
    """Test reviewer/debug endpoints"""
    
    @pytest.fixture
    def reviewer_token(self):
        """Get reviewer account token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REVIEWER_EMAIL,
            "password": REVIEWER_PASSWORD
        })
        if response.status_code != 200:
            # Try to register
            reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": REVIEWER_EMAIL,
                "password": REVIEWER_PASSWORD,
                "name": "Store Reviewer"
            })
            if reg_response.status_code == 200:
                return reg_response.json()["token"]
            pytest.skip("Could not create reviewer account")
        return response.json()["token"]
    
    @pytest.fixture
    def test_user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        return response.json()["token"]
    
    def test_is_reviewer_requires_auth(self):
        """Is-reviewer endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/debug/is-reviewer")
        assert response.status_code == 401
        print("✓ Is-reviewer requires authentication")
    
    def test_is_reviewer_for_reviewer_account(self, reviewer_token):
        """Reviewer account returns is_reviewer=true"""
        response = requests.get(
            f"{BASE_URL}/api/debug/is-reviewer",
            headers={"Authorization": f"Bearer {reviewer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "is_reviewer" in data
        assert "debug_features_enabled" in data
        assert "features" in data
        
        # Reviewer account should have is_reviewer=true
        assert data["is_reviewer"] == True, f"Expected is_reviewer=True for reviewer account"
        assert data["debug_features_enabled"] == True
        assert "mock_qr_scan" in data["features"]
        
        print(f"✓ Reviewer account verified: is_reviewer={data['is_reviewer']}, features={data['features']}")
    
    def test_is_reviewer_for_normal_user(self, test_user_token):
        """Normal user returns is_reviewer=false"""
        response = requests.get(
            f"{BASE_URL}/api/debug/is-reviewer",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "is_reviewer" in data
        assert data["is_reviewer"] == False
        assert len(data.get("features", [])) == 0
        
        print(f"✓ Normal user is_reviewer=False")
    
    def test_mock_qr_scan_requires_auth(self):
        """Mock QR scan requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/debug/mock-qr-scan",
            params={"favor_id": "test_favor_123"}
        )
        assert response.status_code == 401
        print("✓ Mock QR scan requires authentication")
    
    def test_mock_qr_scan_nonexistent_favor(self, reviewer_token):
        """Mock QR scan with nonexistent favor returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/debug/mock-qr-scan",
            headers={"Authorization": f"Bearer {reviewer_token}"},
            params={"favor_id": "nonexistent_favor_12345"}
        )
        assert response.status_code == 404
        print("✓ Mock QR scan nonexistent favor returns 404")


class TestContentModeration:
    """Test content moderation in favor creation"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        return response.json()["token"]
    
    def test_favor_with_offensive_language_blocked(self, auth_token):
        """Favor with offensive language is blocked"""
        response = requests.post(
            f"{BASE_URL}/api/favors",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "type": "offer",
                "title": "Aiuto stronzo",  # offensive word
                "description": "Descrizione normale",
                "category": "Trasporto",
                "duration_hours": 1
            }
        )
        # Should be blocked by content moderation
        assert response.status_code == 400
        print("✓ Offensive language blocked in favor creation")
    
    def test_favor_with_normal_content_allowed(self, auth_token):
        """Normal favor content is allowed"""
        response = requests.post(
            f"{BASE_URL}/api/favors",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "type": "offer",
                "title": f"Aiuto con trasporto TEST_{uuid.uuid4().hex[:6]}",
                "description": "Posso aiutarti con il trasporto",
                "category": "Trasporto",
                "duration_hours": 1
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "favor_id" in data
        print(f"✓ Normal content allowed: {data['favor_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
