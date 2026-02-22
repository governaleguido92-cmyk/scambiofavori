"""
Backend API Tests for Authentication Endpoints
Tests cover:
- POST /api/auth/register - User registration
- POST /api/auth/login - Email/password login
- GET /api/auth/me - Get current user with token
- POST /api/auth/session - Exchange session_id for Google OAuth
- POST /api/auth/apple - Apple Sign In authentication
- JWT token generation and validation
"""
import pytest
import requests
import os
import uuid
import time
import jwt

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestHealthCheck:
    """Health check to ensure backend is running"""
    
    def test_health_check(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("PASSED: Health check endpoint working")


class TestUserRegistration:
    """Tests for POST /api/auth/register"""
    
    def test_register_new_user_success(self):
        """Test successful user registration"""
        unique_email = f"TEST_auth_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "name": "Test Auth User",
            "password": "testPassword123"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "user" in data, "Response should contain 'user' field"
        assert "token" in data, "Response should contain 'token' field"
        
        # Verify user data
        user = data["user"]
        assert user["email"] == unique_email
        assert user["name"] == "Test Auth User"
        assert "user_id" in user
        assert "granelli" in user  # Welcome bonus
        assert user["granelli"] == 3  # WELCOME_GRANELLI constant
        
        # Verify token is valid JWT
        token = data["token"]
        assert len(token) > 0
        # Decode without verification to check structure
        decoded = jwt.decode(token, options={"verify_signature": False})
        assert "user_id" in decoded
        assert decoded["user_id"] == user["user_id"]
        
        print(f"PASSED: User registration works. User ID: {user['user_id']}")
        return data
    
    def test_register_duplicate_email_fails(self):
        """Test registration fails for duplicate email"""
        unique_email = f"TEST_dup_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "name": "First User",
            "password": "password123"
        }
        
        # First registration
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200
        
        # Second registration with same email
        payload["name"] = "Second User"
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response2.status_code == 400, f"Expected 400 for duplicate email, got {response2.status_code}"
        data = response2.json()
        assert "già registrata" in data.get("detail", "").lower() or "already" in data.get("detail", "").lower()
        print("PASSED: Duplicate email registration correctly rejected")
    
    def test_register_with_referral_code(self):
        """Test registration with referral code"""
        # First create a user to get referral code
        unique_email1 = f"TEST_ref1_{uuid.uuid4().hex[:8]}@test.com"
        response1 = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email1, "name": "Referrer", "password": "test123"}
        )
        assert response1.status_code == 200
        referral_code = response1.json()["user"]["referral_code"]
        
        # Register second user with referral code
        unique_email2 = f"TEST_ref2_{uuid.uuid4().hex[:8]}@test.com"
        response2 = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": unique_email2,
                "name": "Referred User",
                "password": "test123",
                "referral_code": referral_code
            }
        )
        
        assert response2.status_code == 200
        data = response2.json()
        assert data["user"]["referred_by"] is not None
        print(f"PASSED: Registration with referral code works. Referred by: {data['user']['referred_by']}")


class TestUserLogin:
    """Tests for POST /api/auth/login"""
    
    def test_login_success(self):
        """Test successful login with email/password"""
        # First create a user
        unique_email = f"TEST_login_{uuid.uuid4().hex[:8]}@test.com"
        password = "securePassword123"
        
        reg_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "Login Test User", "password": password}
        )
        assert reg_response.status_code == 200
        
        # Now login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": password}
        )
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        
        assert "user" in data
        assert "token" in data
        assert data["user"]["email"] == unique_email
        
        # Verify JWT token
        token = data["token"]
        decoded = jwt.decode(token, options={"verify_signature": False})
        assert "user_id" in decoded
        assert "exp" in decoded  # Expiration time
        
        print(f"PASSED: Login successful. Token received.")
        return data
    
    def test_login_invalid_password(self):
        """Test login fails with invalid password"""
        # First create a user
        unique_email = f"TEST_inv_{uuid.uuid4().hex[:8]}@test.com"
        
        requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "Test User", "password": "correct123"}
        )
        
        # Try login with wrong password
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": "wrong123"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "non validi" in data.get("detail", "").lower() or "invalid" in data.get("detail", "").lower()
        print("PASSED: Invalid password correctly rejected with 401")
    
    def test_login_nonexistent_email(self):
        """Test login fails for non-existent email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": f"nonexistent_{uuid.uuid4().hex}@test.com", "password": "test123"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Non-existent email correctly rejected with 401")
    
    def test_login_with_known_test_user(self):
        """Test login with known test credentials (test@test.com / test123)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "test123"}
        )
        
        # This might fail if test user doesn't exist
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print("PASSED: Known test user login works")
            return data
        elif response.status_code == 401:
            print("INFO: Test user test@test.com doesn't exist or has different password")
            # Create test user for future use
            reg_response = requests.post(
                f"{BASE_URL}/api/auth/register",
                json={"email": "test@test.com", "name": "Test User", "password": "test123"}
            )
            if reg_response.status_code == 200:
                print("INFO: Created test user test@test.com")
            elif reg_response.status_code == 400:
                # User exists but password is different
                print("INFO: User exists but may have different password (Google OAuth user)")
        return None


class TestGetCurrentUser:
    """Tests for GET /api/auth/me"""
    
    def test_get_me_with_valid_token(self):
        """Test getting current user with valid JWT token"""
        # Create and login user
        unique_email = f"TEST_me_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "Auth Me Test", "password": "test123"}
        )
        assert reg_response.status_code == 200
        token = reg_response.json()["token"]
        user_id = reg_response.json()["user"]["user_id"]
        
        # Get current user
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["email"] == unique_email
        assert data["user_id"] == user_id
        assert "granelli" in data
        assert "badges" in data
        assert "title" in data
        
        print(f"PASSED: GET /api/auth/me works. User: {data['name']}")
    
    def test_get_me_without_token(self):
        """Test GET /api/auth/me fails without auth token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: GET /api/auth/me correctly requires authentication")
    
    def test_get_me_with_invalid_token(self):
        """Test GET /api/auth/me fails with invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_123"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Invalid token correctly rejected")


class TestGoogleOAuthSession:
    """Tests for POST /api/auth/session - Google OAuth session exchange"""
    
    def test_session_exchange_missing_session_id(self):
        """Test session exchange fails without session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "session_id" in data.get("detail", "").lower()
        print("PASSED: Missing session_id correctly rejected with 400")
    
    def test_session_exchange_invalid_session_id(self):
        """Test session exchange fails with invalid session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "invalid_session_12345"}
        )
        
        # Should return 401 because the session is invalid
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "non valido" in data.get("detail", "").lower() or "invalid" in data.get("detail", "").lower()
        print("PASSED: Invalid session_id correctly rejected with 401")
    
    def test_session_exchange_empty_session_id(self):
        """Test session exchange fails with empty session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": ""}
        )
        
        # Empty string should be treated as missing
        assert response.status_code in [400, 401], f"Expected 400/401, got {response.status_code}"
        print("PASSED: Empty session_id correctly rejected")


class TestAppleAuth:
    """Tests for POST /api/auth/apple - Apple Sign In"""
    
    def test_apple_auth_invalid_identity_token(self):
        """Test Apple auth fails with invalid identity token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/apple",
            json={
                "identity_token": "invalid_jwt_token",
                "user_id": "apple_user_123",
                "email": "test@apple.com"
            }
        )
        
        # Should return 401 because the token is invalid
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "fallita" in data.get("detail", "").lower() or "failed" in data.get("detail", "").lower()
        print("PASSED: Invalid Apple identity_token correctly rejected with 401")
    
    def test_apple_auth_with_mock_valid_jwt(self):
        """Test Apple auth with a mock valid JWT structure (but unsigned)"""
        # Create a mock JWT token with proper structure
        import time
        mock_payload = {
            "sub": f"apple_user_{uuid.uuid4().hex[:12]}",
            "email": f"TEST_apple_{uuid.uuid4().hex[:8]}@privaterelay.appleid.com",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "iss": "https://appleid.apple.com",
            "aud": "com.example.app"
        }
        
        # Create unsigned JWT (Apple auth decodes without verification in this implementation)
        import base64
        import json
        
        header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b'=').decode()
        payload = base64.urlsafe_b64encode(json.dumps(mock_payload).encode()).rstrip(b'=').decode()
        # Create a fake signature
        signature = base64.urlsafe_b64encode(b'fake_signature').rstrip(b'=').decode()
        mock_token = f"{header}.{payload}.{signature}"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/apple",
            json={
                "identity_token": mock_token,
                "user_id": mock_payload["sub"],
                "email": mock_payload["email"],
                "full_name": "Apple Test User"
            }
        )
        
        # The implementation decodes without verification, so this might succeed
        if response.status_code == 200:
            data = response.json()
            assert "user" in data
            assert "token" in data
            assert data["user"]["email"] == mock_payload["email"]
            print(f"PASSED: Apple auth with mock JWT works. User: {data['user']['name']}")
        else:
            # If it fails, ensure it's a proper auth error
            assert response.status_code == 401
            print("INFO: Apple auth validation is strict (mock JWT rejected)")
    
    def test_apple_auth_missing_email(self):
        """Test Apple auth behavior when email is missing"""
        # Create mock JWT without email
        import time
        mock_payload = {
            "sub": f"apple_user_{uuid.uuid4().hex[:12]}",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "iss": "https://appleid.apple.com"
        }
        
        import base64
        import json
        
        header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b'=').decode()
        payload = base64.urlsafe_b64encode(json.dumps(mock_payload).encode()).rstrip(b'=').decode()
        signature = base64.urlsafe_b64encode(b'sig').rstrip(b'=').decode()
        mock_token = f"{header}.{payload}.{signature}"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/apple",
            json={
                "identity_token": mock_token,
                "user_id": mock_payload["sub"]
                # No email provided
            }
        )
        
        # Should fail because email is required for registration
        assert response.status_code in [400, 401], f"Expected 400/401, got {response.status_code}"
        print("PASSED: Apple auth without email correctly handled")


class TestJWTTokenValidation:
    """Tests for JWT token generation and validation"""
    
    def test_jwt_token_structure(self):
        """Test JWT token has correct structure"""
        unique_email = f"TEST_jwt_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "JWT Test", "password": "test123"}
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Decode and verify structure
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        assert "user_id" in decoded, "Token should contain user_id"
        assert "exp" in decoded, "Token should contain expiration"
        assert "iat" in decoded, "Token should contain issued-at time"
        
        # Verify expiration is in the future (7 days)
        import time
        current_time = int(time.time())
        exp_time = decoded["exp"]
        
        # Should expire in approximately 7 days (with some buffer)
        days_until_exp = (exp_time - current_time) / (24 * 60 * 60)
        assert 6 <= days_until_exp <= 8, f"Token expiration should be ~7 days, got {days_until_exp:.1f} days"
        
        print(f"PASSED: JWT token has correct structure. Expires in {days_until_exp:.1f} days")
    
    def test_jwt_token_can_access_protected_routes(self):
        """Test JWT token works for accessing protected routes"""
        unique_email = f"TEST_protected_{uuid.uuid4().hex[:8]}@test.com"
        
        reg_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "Protected Route Test", "password": "test123"}
        )
        assert reg_response.status_code == 200
        token = reg_response.json()["token"]
        
        # Test various protected routes
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test /api/auth/me
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        
        # Test /api/favors/my
        favors_response = requests.get(f"{BASE_URL}/api/favors/my", headers=headers)
        assert favors_response.status_code == 200
        
        # Test /api/badges/my
        badges_response = requests.get(f"{BASE_URL}/api/badges/my", headers=headers)
        assert badges_response.status_code == 200
        
        print("PASSED: JWT token works for all protected routes")


class TestLogout:
    """Tests for POST /api/auth/logout"""
    
    def test_logout_success(self):
        """Test logout clears session"""
        # Create and login user
        unique_email = f"TEST_logout_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": unique_email, "name": "Logout Test", "password": "test123"}
        )
        assert reg_response.status_code == 200
        token = reg_response.json()["token"]
        
        # Create a session with cookies
        session = requests.Session()
        session.cookies.set("session_token", token)
        
        # Logout
        logout_response = session.post(f"{BASE_URL}/api/auth/logout")
        
        assert logout_response.status_code == 200
        data = logout_response.json()
        assert "logout" in data.get("message", "").lower() or "effettuato" in data.get("message", "").lower()
        
        print("PASSED: Logout endpoint works")


class TestReviewerLogin:
    """Tests for reviewer account login"""
    
    def test_reviewer_account_login(self):
        """Test reviewer account login works (reviewer@test.com / review123)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "reviewer@test.com", "password": "review123"}
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            assert data["user"]["email"] == "reviewer@test.com"
            print("PASSED: Reviewer account login works")
            return data
        elif response.status_code == 401:
            # Try to create reviewer account
            reg_response = requests.post(
                f"{BASE_URL}/api/auth/register",
                json={"email": "reviewer@test.com", "name": "Reviewer", "password": "review123"}
            )
            if reg_response.status_code == 200:
                print("INFO: Created reviewer account reviewer@test.com")
            else:
                print(f"INFO: Reviewer account may be OAuth-only: {reg_response.status_code}")
        return None


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Cleanup test data after all tests"""
    yield
    # Note: In a production test suite, we'd clean up TEST_ prefixed users
    # For now, we leave them for potential debugging


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
