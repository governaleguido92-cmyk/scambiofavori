# Scambio di Favori - Product Requirements Document

## Bug Fix (Feb 28, 2026)

### Registration/Login Bug Fixed ✅

**Problem**: Internal Server Error (500) when verifying email code during registration

**Root Cause**: TypeError in backend - comparing timezone-naive datetime from MongoDB with timezone-aware datetime (`datetime.now(timezone.utc)`)

**Solution**: Added timezone handling in `/api/auth/verify-email` endpoint:
```python
if expires.tzinfo is None:
    expires = expires.replace(tzinfo=timezone.utc)
```

**Files Changed**:
- `backend/server.py`: Fixed datetime comparison in `verify_email` function
- `frontend/src/services/api.ts`: Updated `AuthResponse` interface to handle optional fields

### Tested Flow
1. ✅ Registration creates user and returns `requiresVerification: true` + `userId` + `demo_code`
2. ✅ Email verification validates code and returns user + token
3. ✅ Login works for existing users

## Download
`https://hyperlocal-exchange.preview.emergentagent.com/api/download/frontend`

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`
