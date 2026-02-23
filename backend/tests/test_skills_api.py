"""
Test suite for User Skills API endpoints
- GET /api/user/skills - recupera competenze utente
- PUT /api/user/skills - aggiorna competenze utente
- GET /api/categories - lista categorie disponibili
- POST /api/auth/login - login utente
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://granelli-hub.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "skills_test@test.com"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token from login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_success(self, api_client):
        """Test successful login"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data, "Token missing from response"
        assert "user" in data, "User missing from response"
        assert data["user"]["email"] == TEST_EMAIL
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with wrong credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        
        data = response.json()
        assert "detail" in data


class TestCategoriesEndpoint:
    """Categories endpoint tests"""
    
    def test_get_categories(self, api_client):
        """Test GET /api/categories returns list of categories"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Categories list should not be empty"
        
        # Verify category structure
        first_category = data[0]
        assert "name" in first_category, "Category should have name"
        assert "icon" in first_category, "Category should have icon"
        assert "is_micro" in first_category, "Category should have is_micro flag"
    
    def test_categories_contain_expected_values(self, api_client):
        """Test categories contain expected values"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        data = response.json()
        
        category_names = [c["name"] for c in data]
        
        # Verify expected categories exist
        expected_categories = ["Trasporto", "Tecnologia", "Cucina", "Spesa", "Giardinaggio"]
        for expected in expected_categories:
            assert expected in category_names, f"Category '{expected}' not found"
        
        # Verify micro categories
        micro_categories = [c["name"] for c in data if c["is_micro"]]
        assert "Consiglio" in micro_categories, "Consiglio should be a micro category"
        assert "Informazione" in micro_categories, "Informazione should be a micro category"


class TestSkillsEndpoints:
    """User skills CRUD tests"""
    
    def test_get_skills_requires_auth(self):
        """Test GET /api/user/skills requires authentication"""
        # Use a fresh session without any auth
        fresh_session = requests.Session()
        fresh_session.headers.update({"Content-Type": "application/json"})
        
        response = fresh_session.get(f"{BASE_URL}/api/user/skills")
        assert response.status_code == 401, f"Should return 401 without auth, got {response.status_code}"
    
    def test_get_skills_authenticated(self, authenticated_client):
        """Test GET /api/user/skills returns user skills"""
        response = authenticated_client.get(f"{BASE_URL}/api/user/skills")
        assert response.status_code == 200
        
        data = response.json()
        assert "skills" in data, "Response should contain skills field"
        assert isinstance(data["skills"], list), "Skills should be a list"
    
    def test_update_skills_success(self, authenticated_client):
        """Test PUT /api/user/skills updates skills"""
        new_skills = ["Trasporto", "Cucina", "Compagnia"]
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/user/skills",
            json={"skills": new_skills}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "skills" in data, "Response should contain skills"
        assert set(data["skills"]) == set(new_skills), "Skills should match input"
    
    def test_update_skills_and_verify_persistence(self, authenticated_client):
        """Test skills update persists - Create → GET verification pattern"""
        # UPDATE skills
        test_skills = ["Tecnologia", "Giardinaggio", "Altro"]
        update_response = authenticated_client.put(
            f"{BASE_URL}/api/user/skills",
            json={"skills": test_skills}
        )
        assert update_response.status_code == 200
        
        # GET to verify persistence
        get_response = authenticated_client.get(f"{BASE_URL}/api/user/skills")
        assert get_response.status_code == 200
        
        fetched_skills = get_response.json()["skills"]
        assert set(fetched_skills) == set(test_skills), "Persisted skills should match updated skills"
    
    def test_update_skills_filters_invalid(self, authenticated_client):
        """Test PUT /api/user/skills filters out invalid skills"""
        # Mix of valid and invalid skills
        skills_with_invalid = ["Trasporto", "InvalidCategory", "Cucina", "FakeSkill"]
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/user/skills",
            json={"skills": skills_with_invalid}
        )
        assert response.status_code == 200
        
        data = response.json()
        returned_skills = data["skills"]
        
        # Should only contain valid skills
        assert "Trasporto" in returned_skills, "Valid skill Trasporto should be included"
        assert "Cucina" in returned_skills, "Valid skill Cucina should be included"
        assert "InvalidCategory" not in returned_skills, "Invalid skill should be filtered out"
        assert "FakeSkill" not in returned_skills, "Invalid skill should be filtered out"
    
    def test_update_skills_empty_list(self, authenticated_client):
        """Test clearing all skills"""
        # Clear skills
        response = authenticated_client.put(
            f"{BASE_URL}/api/user/skills",
            json={"skills": []}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["skills"] == [], "Skills should be empty"
        
        # Verify persistence
        get_response = authenticated_client.get(f"{BASE_URL}/api/user/skills")
        assert get_response.json()["skills"] == [], "Persisted skills should be empty"
    
    def test_update_skills_all_categories(self, authenticated_client):
        """Test setting all categories as skills"""
        # Get all categories first
        categories_response = authenticated_client.get(f"{BASE_URL}/api/categories")
        all_categories = [c["name"] for c in categories_response.json()]
        
        # Set all categories as skills
        response = authenticated_client.put(
            f"{BASE_URL}/api/user/skills",
            json={"skills": all_categories}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["skills"]) == len(all_categories), "All categories should be saved as skills"


class TestUserDataIntegrity:
    """Test user data includes skills field"""
    
    def test_login_response_includes_skills(self, api_client):
        """Test login response includes skills in user object"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        
        user = response.json()["user"]
        assert "skills" in user, "User object should include skills field"
        assert isinstance(user["skills"], list), "Skills should be a list"


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_skills(authenticated_client):
    """Restore original skills after tests"""
    # Store original skills at start
    original_response = authenticated_client.get(f"{BASE_URL}/api/user/skills")
    original_skills = original_response.json().get("skills", [])
    
    yield
    
    # Restore original skills after all tests
    authenticated_client.put(
        f"{BASE_URL}/api/user/skills",
        json={"skills": original_skills}
    )
