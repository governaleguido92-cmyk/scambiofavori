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

### 1. Profile Cleanup ✅
- Removed "Bio" (Biografia) from profile completion requirements
- Removed "Neighborhood" (Quartiere) from profile completion and User model
- Profile completion now based on: Photo (20%), Skills (35%), First Favor (30%), Email verified (15%)

### 2. Zero Granelli Control ✅
- Users with 0 Granelli can only OFFER favors, not REQUEST them
- Clear alert message when trying to request with zero balance

### 3. Registration with Email Verification ✅
- New 3-slide onboarding during registration explaining:
  - Ethical values of the community
  - How Granelli currency works  
  - How to use the app
- Email verification with 6-digit code (MOCKED - code shown in console)
- Each email can only be used once

### 4. Privacy Updates ✅
- Removed "Micro-Favori" from "Come funzionano i Granelli" section
- Address only visible on map, not in favor cards or details
- Location can be shared only via chat

### 5. QR Scanner + Review Notifications ✅
- Fixed backend error
- Better error handling for network issues
- Auto-opens review form after successful scan
- Notifications: "Nuova Recensione!" and "Ciclo Completato!"

## API Endpoints
- `POST /api/auth/register` - Returns `requiresVerification: true` + `userId`
- `POST /api/auth/verify-email` - Verify email with 6-digit code
- `POST /api/auth/resend-code` - Resend verification code

## Build Instructions
1. Download: `https://granelli-app-1.preview.emergentagent.com/api/download/frontend`
2. Extract and run standard Expo build commands

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`

## Pending / Backlog
- Real email sending integration (currently mocked)
- Offline Notice update (user needs to clarify requirements)
