# Scambio di Favori - Product Requirements Document

## Original Problem Statement
Build a mobile application "Scambio di Favori" (Favor Exchange), a hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Core Features
- **Favor Lifecycle**: Posting, accepting, completing favors with QR code confirmation
- **Currency System**: "Granelli" with social debt mechanism, 3 starting credits
- **Gamification**: Badges, leaderboard, social impact bars
- **Security**: User reporting, blocking, content filtering
- **Authentication**: JWT, Google OAuth, Apple Sign In
- **Monetization**: Stripe subscription (€1/month) for "Sostenitori"

## Technical Stack
- **Frontend**: Expo (SDK 54+), React Native, Expo Router
- **Backend**: FastAPI, Pydantic, Motor (MongoDB)
- **Database**: MongoDB
- **Payments**: Stripe

## Key API Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/favors` - List favors
- `POST /api/favors` - Create favor
- `POST /api/favors/{id}/verify-qr` - Complete favor via QR
- `GET /api/download/frontend` - Download frontend ZIP

## Current Status (Feb 28, 2026)

### Completed
- Full CRUD for favors
- QR code scanning for favor completion
- Chat with location sharing
- Onboarding slides after legal consent
- Profile completion tracking
- Supporter subscription flow
- Real-time notifications
- 10km search radius limit

### Recent Changes
- Fixed navigation issue in `app/index.tsx` with `hasNavigated` ref
- Added better error handling for deep links
- Improved loading state display

### Pending Verification (User Testing)
- Photo upload from library (ActionSheet fix)
- Chat keyboard offset fix
- QR code scanner functionality

### Known Issues
- User reports "black screen" on app start - potentially build environment issue
- User struggles with local iOS build process

## Build Instructions for User
1. Download code from `/api/download/frontend`
2. Extract to `~/Downloads/scambio-frontend`
3. Run: `cd ~/Downloads/scambio-frontend && yarn install`
4. Run: `npx expo prebuild --platform ios --clean`
5. Run: `cd ios && pod install --repo-update && cd ..`
6. Open: `open ios/scambiodifavori.xcworkspace`
7. In Xcode: Select simulator, press Play button

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`
