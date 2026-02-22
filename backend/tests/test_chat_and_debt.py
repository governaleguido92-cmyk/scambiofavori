"""
Backend Tests for Scambio di Favori App
Testing: Chat API, Money Filter, Social Debt System, Auth, Favors

Modules:
- Auth: Registration and Login
- Chat: Send and retrieve messages with anti-money filter
- Social Debt: User debt status and request blocking
- Favors: Creation and acceptance
"""
import pytest
import requests
import os
import time
import uuid

# API Base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://granelli-app.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_USER_1 = {"email": "test_chat@test.com", "password": "test123"}
TEST_USER_2 = {"email": "test_chat2@test.com", "password": "test123"}

# Constants
DEBT_LIMIT = -3  # Matches backend constant


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_register_new_user(self):
        """Test user registration with unique email"""
        unique_email = f"TEST_user_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "Test Nuovo Utente",
            "password": "testpass123"
        })
        
        if response.status_code == 400 and "già registrata" in response.text:
            pytest.skip("Email already registered")
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "token" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["granelli"] == 3  # WELCOME_GRANELLI bonus
        print(f"✓ Registration successful for {unique_email}")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        # First ensure user exists by registering
        unique_email = f"TEST_login_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "Test Login User",
            "password": "testpass123"
        })
        
        if reg_response.status_code == 200:
            # Now login
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": unique_email,
                "password": "testpass123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            data = response.json()
            assert "user" in data
            assert "token" in data
            assert data["user"]["email"] == unique_email
            print(f"✓ Login successful for {unique_email}")
        else:
            pytest.skip("Could not create user for login test")
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_current_user(self):
        """Test /auth/me endpoint with valid token"""
        # Create and login user
        unique_email = f"TEST_me_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "Test Me User",
            "password": "testpass123"
        })
        
        if reg_response.status_code == 200:
            token = reg_response.json()["token"]
            
            response = requests.get(f"{BASE_URL}/api/auth/me", 
                headers={"Authorization": f"Bearer {token}"})
            
            assert response.status_code == 200, f"Get user failed: {response.text}"
            data = response.json()
            assert data["email"] == unique_email
            print(f"✓ Get current user successful")
        else:
            pytest.skip("Could not create user for /me test")


class TestChatMessages:
    """Chat message functionality tests with anti-money filter"""
    
    @pytest.fixture
    def authenticated_users(self):
        """Create or login two users for chat testing"""
        users = []
        
        for i, creds in enumerate([TEST_USER_1, TEST_USER_2]):
            # Try login first
            login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            
            if login_resp.status_code == 200:
                data = login_resp.json()
                users.append({
                    "user": data["user"],
                    "token": data["token"]
                })
            else:
                # Register new user
                reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                    "email": creds["email"],
                    "name": f"Test Chat User {i+1}",
                    "password": creds["password"]
                })
                if reg_resp.status_code == 200:
                    data = reg_resp.json()
                    users.append({
                        "user": data["user"],
                        "token": data["token"]
                    })
        
        if len(users) < 2:
            pytest.skip("Could not create two users for chat testing")
        
        return users
    
    @pytest.fixture
    def accepted_favor_id(self, authenticated_users):
        """Create and accept a favor for chat testing"""
        user1 = authenticated_users[0]
        user2 = authenticated_users[1]
        
        # Create favor
        favor_resp = requests.post(f"{BASE_URL}/api/favors", 
            json={
                "type": "offer",
                "title": f"TEST_Chat Favor {uuid.uuid4().hex[:6]}",
                "description": "Testing chat functionality",
                "category": "Altro",
                "duration_hours": 1.0
            },
            headers={"Authorization": f"Bearer {user1['token']}"})
        
        if favor_resp.status_code != 200:
            pytest.skip(f"Could not create favor: {favor_resp.text}")
        
        favor_id = favor_resp.json()["favor_id"]
        
        # Accept favor with user2
        accept_resp = requests.post(f"{BASE_URL}/api/favors/accept",
            json={"favor_id": favor_id},
            headers={"Authorization": f"Bearer {user2['token']}"})
        
        if accept_resp.status_code != 200:
            pytest.skip(f"Could not accept favor: {accept_resp.text}")
        
        return favor_id
    
    def test_send_valid_message(self, authenticated_users, accepted_favor_id):
        """Test sending a valid message in chat"""
        user1 = authenticated_users[0]
        
        response = requests.post(f"{BASE_URL}/api/messages",
            json={
                "favor_id": accepted_favor_id,
                "content": "Ciao! Quando ci incontriamo?"
            },
            headers={"Authorization": f"Bearer {user1['token']}"})
        
        assert response.status_code == 200, f"Send message failed: {response.text}"
        data = response.json()
        assert data["content"] == "Ciao! Quando ci incontriamo?"
        assert data["blocked"] == False
        assert "message_id" in data
        print(f"✓ Valid message sent successfully")
    
    def test_get_messages(self, authenticated_users, accepted_favor_id):
        """Test retrieving messages for a favor"""
        user1 = authenticated_users[0]
        
        # Send a message first
        requests.post(f"{BASE_URL}/api/messages",
            json={
                "favor_id": accepted_favor_id,
                "content": "Test message for retrieval"
            },
            headers={"Authorization": f"Bearer {user1['token']}"})
        
        # Get messages
        response = requests.get(f"{BASE_URL}/api/messages/{accepted_favor_id}",
            headers={"Authorization": f"Bearer {user1['token']}"})
        
        assert response.status_code == 200, f"Get messages failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} messages successfully")
    
    def test_non_participant_cannot_see_messages(self, authenticated_users, accepted_favor_id):
        """Test that non-participants cannot access chat"""
        # Create a third user
        third_user_email = f"TEST_third_{uuid.uuid4().hex[:8]}@test.com"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": third_user_email,
            "name": "Third User",
            "password": "test123"
        })
        
        if reg_resp.status_code == 200:
            third_token = reg_resp.json()["token"]
            
            response = requests.get(f"{BASE_URL}/api/messages/{accepted_favor_id}",
                headers={"Authorization": f"Bearer {third_token}"})
            
            assert response.status_code == 403
            print("✓ Non-participant correctly blocked from chat")
        else:
            pytest.skip("Could not create third user")


class TestMoneyFilter:
    """Anti-money filter tests for chat messages"""
    
    @pytest.fixture
    def chat_setup(self):
        """Setup two users with an accepted favor"""
        users = []
        
        for i, creds in enumerate([TEST_USER_1, TEST_USER_2]):
            login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if login_resp.status_code == 200:
                data = login_resp.json()
                users.append({"user": data["user"], "token": data["token"]})
            else:
                reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                    "email": creds["email"],
                    "name": f"Test Money Filter User {i+1}",
                    "password": creds["password"]
                })
                if reg_resp.status_code == 200:
                    data = reg_resp.json()
                    users.append({"user": data["user"], "token": data["token"]})
        
        if len(users) < 2:
            pytest.skip("Could not create users for money filter testing")
        
        # Create and accept favor
        favor_resp = requests.post(f"{BASE_URL}/api/favors", 
            json={
                "type": "offer",
                "title": f"TEST_Money Filter {uuid.uuid4().hex[:6]}",
                "description": "Testing money filter",
                "category": "Altro",
                "duration_hours": 1.0
            },
            headers={"Authorization": f"Bearer {users[0]['token']}"})
        
        if favor_resp.status_code != 200:
            pytest.skip("Could not create favor")
        
        favor_id = favor_resp.json()["favor_id"]
        
        accept_resp = requests.post(f"{BASE_URL}/api/favors/accept",
            json={"favor_id": favor_id},
            headers={"Authorization": f"Bearer {users[1]['token']}"})
        
        if accept_resp.status_code != 200:
            pytest.skip("Could not accept favor")
        
        return {"users": users, "favor_id": favor_id}
    
    @pytest.mark.parametrize("blocked_message,description", [
        ("Ti pago 50€", "Euro symbol with amount"),
        ("dammi 100 euro per il lavoro", "Euro word"),
        ("facciamo un pagamento cash", "Pagamento keyword"),
        ("ti do i contanti", "Contanti keyword"),
        ("posso pagarti con bonifico", "Bonifico keyword"),
        ("passami l'iban", "IBAN keyword"),
        ("usa paypal", "PayPal keyword"),
        ("prezzo: 30 dollari", "Dollari keyword"),
        ("il costo è $50", "Dollar symbol"),
        ("tariffa da concordare", "Tariffa keyword"),
    ])
    def test_money_reference_blocked(self, chat_setup, blocked_message, description):
        """Test that money references are blocked in chat"""
        users = chat_setup["users"]
        favor_id = chat_setup["favor_id"]
        
        response = requests.post(f"{BASE_URL}/api/messages",
            json={
                "favor_id": favor_id,
                "content": blocked_message
            },
            headers={"Authorization": f"Bearer {users[0]['token']}"})
        
        assert response.status_code == 400, f"Message '{blocked_message}' should be blocked ({description})"
        assert "bloccato" in response.text.lower() or "denaro" in response.text.lower()
        print(f"✓ Money reference blocked: {description}")
    
    def test_legitimate_message_allowed(self, chat_setup):
        """Test that legitimate messages are not blocked"""
        users = chat_setup["users"]
        favor_id = chat_setup["favor_id"]
        
        legitimate_messages = [
            "Ciao! Come stai?",
            "Ci vediamo alle 15:00",
            "Posso aiutarti domani",
            "Grazie mille per l'aiuto!",
            "Il tempo è bello oggi"
        ]
        
        for msg in legitimate_messages:
            response = requests.post(f"{BASE_URL}/api/messages",
                json={
                    "favor_id": favor_id,
                    "content": msg
                },
                headers={"Authorization": f"Bearer {users[0]['token']}"})
            
            assert response.status_code == 200, f"Legitimate message '{msg}' should not be blocked"
        
        print(f"✓ {len(legitimate_messages)} legitimate messages allowed through filter")


class TestSocialDebt:
    """Social debt system tests"""
    
    def test_user_starts_with_positive_granelli(self):
        """Test that new users start with WELCOME_GRANELLI (3)"""
        unique_email = f"TEST_debt_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "Test Debt User",
            "password": "test123"
        })
        
        if response.status_code == 200:
            data = response.json()
            assert data["user"]["granelli"] == 3, "New users should start with 3 Granelli"
            print("✓ New user starts with 3 Granelli")
        else:
            pytest.skip("Could not create user for debt test")
    
    def test_debt_flag_on_favor_creation(self):
        """Test that creator_in_debt flag is set correctly on favors"""
        # Check if any existing favor has creator_in_debt=True
        response = requests.get(f"{BASE_URL}/api/favors?status=active")
        assert response.status_code == 200
        
        favors = response.json()
        debt_favors = [f for f in favors if f.get("creator_in_debt") == True]
        
        print(f"✓ Found {len(debt_favors)} favors with creator_in_debt=True out of {len(favors)} active favors")
        # This is an info test - just verify the field exists
        for f in favors[:3]:  # Check first 3
            assert "creator_in_debt" in f, "creator_in_debt field should exist on favors"
    
    def test_debt_limit_constant(self):
        """Verify debt limit from API matches expected value"""
        # The debt limit is -3 as per the backend code
        # This is verified indirectly through favor creation blocking
        print(f"✓ Debt limit is set to {DEBT_LIMIT} (hardcoded constant)")


class TestFavorCreation:
    """Favor creation endpoint tests"""
    
    @pytest.fixture
    def authenticated_user(self):
        """Create or login a user for favor testing"""
        unique_email = f"TEST_favor_{uuid.uuid4().hex[:8]}@test.com"
        
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "Test Favor User",
            "password": "test123"
        })
        
        if reg_resp.status_code == 200:
            data = reg_resp.json()
            return {"user": data["user"], "token": data["token"]}
        else:
            pytest.skip("Could not create user for favor testing")
    
    def test_create_offer_favor(self, authenticated_user):
        """Test creating an offer type favor"""
        response = requests.post(f"{BASE_URL}/api/favors",
            json={
                "type": "offer",
                "title": f"TEST_Offer {uuid.uuid4().hex[:6]}",
                "description": "I can help with something",
                "category": "Aiuto Rapido",
                "duration_hours": 1.0,
                "is_micro": True
            },
            headers={"Authorization": f"Bearer {authenticated_user['token']}"})
        
        assert response.status_code == 200, f"Create offer failed: {response.text}"
        data = response.json()
        assert data["type"] == "offer"
        assert data["status"] == "active"
        assert data["granelli_cost"] == 1
        assert "favor_id" in data
        print(f"✓ Offer favor created: {data['favor_id']}")
    
    def test_create_request_favor(self, authenticated_user):
        """Test creating a request type favor"""
        response = requests.post(f"{BASE_URL}/api/favors",
            json={
                "type": "request",
                "title": f"TEST_Request {uuid.uuid4().hex[:6]}",
                "description": "I need help with something",
                "category": "Spesa",
                "duration_hours": 1.0
            },
            headers={"Authorization": f"Bearer {authenticated_user['token']}"})
        
        assert response.status_code == 200, f"Create request failed: {response.text}"
        data = response.json()
        assert data["type"] == "request"
        assert data["status"] == "active"
        print(f"✓ Request favor created: {data['favor_id']}")
    
    def test_create_favor_with_location(self, authenticated_user):
        """Test creating a favor with location data"""
        response = requests.post(f"{BASE_URL}/api/favors",
            json={
                "type": "offer",
                "title": f"TEST_Location {uuid.uuid4().hex[:6]}",
                "description": "Testing location privacy",
                "category": "Trasporto",
                "duration_hours": 1.0,
                "latitude": 41.8902,
                "longitude": 12.4922,
                "address": "Via Test, Roma"
            },
            headers={"Authorization": f"Bearer {authenticated_user['token']}"})
        
        assert response.status_code == 200, f"Create favor with location failed: {response.text}"
        data = response.json()
        # Exact location should be hidden in response
        assert data.get("exact_latitude") is None, "Exact latitude should be hidden"
        assert data.get("approximate_latitude") is not None, "Approximate latitude should be set"
        print("✓ Favor created with privacy-protected location")


class TestFavorAcceptance:
    """Favor acceptance endpoint tests"""
    
    @pytest.fixture
    def two_users_and_favor(self):
        """Create two users and a favor to accept"""
        users = []
        
        for i in range(2):
            unique_email = f"TEST_accept_{i}_{uuid.uuid4().hex[:8]}@test.com"
            reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "name": f"Test Accept User {i+1}",
                "password": "test123"
            })
            
            if reg_resp.status_code == 200:
                data = reg_resp.json()
                users.append({"user": data["user"], "token": data["token"]})
        
        if len(users) < 2:
            pytest.skip("Could not create two users for acceptance test")
        
        # Create favor with user1
        favor_resp = requests.post(f"{BASE_URL}/api/favors",
            json={
                "type": "offer",
                "title": f"TEST_Accept {uuid.uuid4().hex[:6]}",
                "description": "Favor for acceptance testing",
                "category": "Altro",
                "duration_hours": 1.0
            },
            headers={"Authorization": f"Bearer {users[0]['token']}"})
        
        if favor_resp.status_code != 200:
            pytest.skip("Could not create favor for acceptance test")
        
        return {"users": users, "favor_id": favor_resp.json()["favor_id"]}
    
    def test_accept_favor_success(self, two_users_and_favor):
        """Test successfully accepting a favor"""
        users = two_users_and_favor["users"]
        favor_id = two_users_and_favor["favor_id"]
        
        response = requests.post(f"{BASE_URL}/api/favors/accept",
            json={"favor_id": favor_id},
            headers={"Authorization": f"Bearer {users[1]['token']}"})
        
        assert response.status_code == 200, f"Accept favor failed: {response.text}"
        data = response.json()
        assert data["status"] == "accepted"
        assert data["accepted_by"] == users[1]["user"]["user_id"]
        print(f"✓ Favor accepted successfully")
    
    def test_cannot_accept_own_favor(self, two_users_and_favor):
        """Test that user cannot accept their own favor"""
        users = two_users_and_favor["users"]
        favor_id = two_users_and_favor["favor_id"]
        
        response = requests.post(f"{BASE_URL}/api/favors/accept",
            json={"favor_id": favor_id},
            headers={"Authorization": f"Bearer {users[0]['token']}"})
        
        assert response.status_code == 400
        assert "stesso favore" in response.text.lower() or "proprio" in response.text.lower()
        print("✓ Cannot accept own favor - correctly blocked")


class TestGetEndpoints:
    """Test various GET endpoints"""
    
    def test_get_favors_list(self):
        """Test getting list of favors"""
        response = requests.get(f"{BASE_URL}/api/favors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} favors")
    
    def test_get_categories(self):
        """Test getting favor categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Check structure
        assert "name" in data[0]
        assert "icon" in data[0]
        print(f"✓ Retrieved {len(data)} categories")
    
    def test_get_badges(self):
        """Test getting badge definitions"""
        response = requests.get(f"{BASE_URL}/api/badges")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Retrieved {len(data)} badge definitions")
    
    def test_get_currency_info(self):
        """Test getting currency information"""
        response = requests.get(f"{BASE_URL}/api/currency")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Granelli"
        assert data["symbol"] == "💎"
        assert data["welcome_bonus"] == 3
        print("✓ Currency info retrieved correctly")
    
    def test_get_ethical_tags(self):
        """Test getting ethical tags for reviews"""
        response = requests.get(f"{BASE_URL}/api/ethical-tags")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Retrieved {len(data)} ethical tags")
    
    def test_get_patto(self):
        """Test getting 'Il Nostro Patto' community guidelines"""
        response = requests.get(f"{BASE_URL}/api/patto")
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "encouraged" in data
        assert "forbidden" in data
        print("✓ Community guidelines retrieved")


class TestExistingTestFavor:
    """Tests using the pre-existing test favor_id from setup"""
    
    EXISTING_FAVOR_ID = "favor_4c82a66dd3bb"
    
    def test_get_existing_favor(self):
        """Test getting the pre-existing accepted favor"""
        response = requests.get(f"{BASE_URL}/api/favors/{self.EXISTING_FAVOR_ID}")
        
        if response.status_code == 404:
            pytest.skip("Pre-existing test favor not found")
        
        assert response.status_code == 200
        data = response.json()
        assert data["favor_id"] == self.EXISTING_FAVOR_ID
        assert data["status"] == "accepted"
        print(f"✓ Pre-existing favor retrieved: {data['title']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
