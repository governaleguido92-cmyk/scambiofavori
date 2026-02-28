"""
Test Email Verification API Endpoints
Tests:
- POST /api/auth/register - Registration with email verification flow
- POST /api/auth/verify-email - Email code verification
- POST /api/auth/resend-code - Resend verification code
- POST /api/auth/login - Login flow
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://hyperlocal-exchange.preview.emergentagent.com').rstrip('/')


class TestEmailVerificationAPI:
    """Email Verification API Tests"""
    
    @pytest.fixture
    def api_client(self):
        """Shared requests session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_login_existing_user(self, api_client):
        """Test login with existing user credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "reviewer@test.com",
            "password": "review123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Missing token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == "reviewer@test.com"
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0
        print(f"✅ Login successful for reviewer@test.com")
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials returns 401"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected with 401")
    
    def test_verify_email_invalid_user(self, api_client):
        """Test verify-email endpoint with non-existent user returns 404"""
        response = api_client.post(f"{BASE_URL}/api/auth/verify-email", json={
            "user_id": "nonexistent_user_123",
            "code": "123456"
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        print("✅ verify-email correctly returns 404 for nonexistent user")
    
    def test_resend_code_invalid_user(self, api_client):
        """Test resend-code endpoint with non-existent user returns 404"""
        response = api_client.post(f"{BASE_URL}/api/auth/resend-code", json={
            "user_id": "nonexistent_user_456"
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        print("✅ resend-code correctly returns 404 for nonexistent user")
    
    def test_register_new_user_flow(self, api_client):
        """Test registration flow - should require email verification"""
        unique_email = f"test_user_{uuid.uuid4().hex[:8]}@testmail.com"
        
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "requiresVerification" in data, "Missing requiresVerification field"
        assert data["requiresVerification"] == True, "Expected requiresVerification to be True"
        assert "userId" in data, "Missing userId in response"
        assert "message" in data, "Missing message in response"
        
        print(f"✅ Registration successful - verification required for {unique_email}")
        print(f"   User ID: {data['userId']}")
        print(f"   Message: {data['message']}")
        
        # Return user_id for cleanup
        return data["userId"]
    
    def test_register_duplicate_email(self, api_client):
        """Test registration with existing email returns error"""
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": "reviewer@test.com",
            "password": "testpass123",
            "name": "Duplicate User"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        print("✅ Duplicate email registration correctly rejected with 400")
    
    def test_verify_email_wrong_code(self, api_client):
        """Test verify-email with wrong code"""
        # First register a new user
        unique_email = f"test_verify_{uuid.uuid4().hex[:8]}@testmail.com"
        
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test Verify User"
        })
        
        assert reg_response.status_code == 200
        user_id = reg_response.json()["userId"]
        
        # Try to verify with wrong code
        verify_response = api_client.post(f"{BASE_URL}/api/auth/verify-email", json={
            "user_id": user_id,
            "code": "000000"  # Wrong code
        })
        
        assert verify_response.status_code == 400, f"Expected 400, got {verify_response.status_code}"
        print("✅ Wrong verification code correctly rejected with 400")
    
    def test_resend_code_for_registered_user(self, api_client):
        """Test resend-code for a recently registered user"""
        # First register a new user
        unique_email = f"test_resend_{uuid.uuid4().hex[:8]}@testmail.com"
        
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test Resend User"
        })
        
        assert reg_response.status_code == 200
        user_id = reg_response.json()["userId"]
        
        # Resend code
        resend_response = api_client.post(f"{BASE_URL}/api/auth/resend-code", json={
            "user_id": user_id
        })
        
        assert resend_response.status_code == 200, f"Expected 200, got {resend_response.status_code}"
        data = resend_response.json()
        assert "message" in data
        print(f"✅ Resend code successful: {data['message']}")


class TestFavorsAndCategoriesAPI:
    """Test favor cards and category filters"""
    
    @pytest.fixture
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture
    def auth_token(self, api_client):
        """Get authentication token"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "reviewer@test.com",
            "password": "review123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_get_categories(self, api_client):
        """Test GET /api/categories returns list of categories"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check category structure
        for cat in data[:3]:
            assert "name" in cat
            assert "icon" in cat
        
        print(f"✅ Categories endpoint returns {len(data)} categories")
    
    def test_get_favors_all(self, api_client, auth_token):
        """Test GET /api/favors returns list of favors"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/favors")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check favor card data structure
        if len(data) > 0:
            favor = data[0]
            assert "favor_id" in favor
            assert "title" in favor
            assert "description" in favor
            assert "category" in favor
            assert "granelli_cost" in favor
            assert "type" in favor
            print(f"✅ Favors endpoint returns {len(data)} favors with correct structure")
        else:
            print("✅ Favors endpoint returns empty list (no favors)")
    
    def test_get_favors_by_type_offer(self, api_client, auth_token):
        """Test filtering favors by type=offer"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/favors?type=offer")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all returned favors are offers
        for favor in data:
            assert favor["type"] == "offer", f"Expected type=offer, got {favor['type']}"
        
        print(f"✅ Type filter 'offer' works - {len(data)} offers returned")
    
    def test_get_favors_by_type_request(self, api_client, auth_token):
        """Test filtering favors by type=request"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/favors?type=request")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all returned favors are requests
        for favor in data:
            assert favor["type"] == "request", f"Expected type=request, got {favor['type']}"
        
        print(f"✅ Type filter 'request' works - {len(data)} requests returned")
    
    def test_get_favors_by_category(self, api_client, auth_token):
        """Test filtering favors by category"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Test with a common category
        response = api_client.get(f"{BASE_URL}/api/favors?category=Trasporto")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all returned favors have the correct category
        for favor in data:
            assert favor["category"] == "Trasporto", f"Expected category=Trasporto, got {favor['category']}"
        
        print(f"✅ Category filter 'Trasporto' works - {len(data)} favors returned")
    
    def test_get_single_favor(self, api_client, auth_token):
        """Test GET /api/favors/{id} returns single favor"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # First get list of favors
        list_response = api_client.get(f"{BASE_URL}/api/favors")
        favors = list_response.json()
        
        if len(favors) == 0:
            pytest.skip("No favors to test")
        
        favor_id = favors[0]["favor_id"]
        
        # Get single favor
        response = api_client.get(f"{BASE_URL}/api/favors/{favor_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["favor_id"] == favor_id
        assert "title" in data
        assert "description" in data
        
        print(f"✅ Single favor GET works for {favor_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
