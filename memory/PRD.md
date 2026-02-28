# Scambio di Favori - Product Requirements Document

## Original Problem Statement
Build a mobile application "Scambio di Favori" (Favor Exchange), a hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Core Features
- **Favor Lifecycle**: Posting, accepting, completing favors with QR code confirmation
- **Currency System**: "Granelli" with social debt mechanism, 3 starting credits
- **Gamification**: Badges, leaderboard, social impact bars
- **Security**: User reporting, blocking, content filtering
- **Authentication**: JWT with email verification, Google OAuth, Apple Sign In
- **Monetization**: Stripe subscription (€1/month) for "Sostenitori"

## Recent Changes (Feb 28, 2026)

### 1. Zero Granelli Control
- Users with 0 Granelli can only OFFER favors, not REQUEST them
- Clear alert message when trying to request with zero balance

### 2. Registration with Email Verification
- New 3-slide onboarding during registration explaining:
  - Ethical values of the community
  - How Granelli currency works
  - How to use the app
- Email verification with 6-digit code (MOCKED - code shown in console)
- Each email can only be used once

### 3. Privacy Updates
- Removed "Micro-Favori" from "Come funzionano i Granelli" section
- Address only visible on map, not in favor cards or details
- Location can be shared only via chat

### 4. QR Scanner Improvements
- Fixed backend error (`create_secure_transaction`)
- Better error handling for network issues
- Auto-opens review form after successful scan

### 5. Review Notifications
- "Nuova Recensione!" notification when someone reviews you
- "Ciclo Completato!" notification when both parties reviewed

## API Endpoints (New)
- `POST /api/auth/register` - Returns `requiresVerification: true` + `userId`
- `POST /api/auth/verify-email` - Verify email with 6-digit code
- `POST /api/auth/resend-code` - Resend verification code

## Key Files Changed
- `frontend/app/(auth)/register.tsx` - New onboarding + verification UI
- `frontend/src/components/RegistrationOnboarding.tsx` - NEW: 3 slides
- `frontend/app/(tabs)/create.tsx` - Zero granelli check
- `backend/server.py` - Email verification endpoints

## Build Instructions
1. Download: `https://granelli-app-1.preview.emergentagent.com/api/download/frontend`
2. Extract and run standard Expo build commands

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`

## Pending
- Remove bio and neighborhood from profile (user request)
- Real email sending integration (currently mocked)
