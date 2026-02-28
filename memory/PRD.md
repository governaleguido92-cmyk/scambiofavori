# Scambio di Favori - Product Requirements Document

## Last Update: February 2026

---

## Original Problem Statement
Mobile application "Scambio di Favori" (Favor Exchange) - a hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

---

## Recent Changes (February 2026)

### Session Updates:
1. **Onboarding Slides**: Added 3 intro slides after accepting legal terms
2. **Micro Favori Removed**: Eliminated micro favor categories and logic
3. **Photo Upload Fix**: Added ActionSheet with Camera/Library options
4. **Categories Updated**: New categories (Babysitting, Animali, Ripetizioni) with better icons
5. **Download Endpoint**: `/api/download/frontend` for ZIP distribution

---

## Core Features Implemented

### Authentication
- ✅ Email/Password login
- ✅ Google OAuth
- ✅ Apple Sign In
- ✅ JWT tokens
- ✅ Legal consent modal
- ✅ Onboarding slides (NEW)

### Favor System
- ✅ Create offers/requests
- ✅ Accept favors
- ✅ QR code confirmation
- ✅ Expiration system (1-10 days)
- ✅ Emergency favors
- ❌ Micro favors (REMOVED)

### Currency (Granelli)
- ✅ Earn by helping
- ✅ Spend on requests
- ✅ Social debt limit (-5)
- ✅ Solidarity fund donations

### Gamification
- ✅ Badges system
- ✅ Leaderboard
- ✅ User levels/titles
- ✅ Skills matching

### Monetization
- ✅ Stripe subscription (€1/month)
- ✅ Supporter badges
- ✅ Profile highlights

### Profile
- ✅ Photo upload (Camera + Library)
- ✅ Profile completion bar
- ✅ Referral codes
- ✅ Account deletion (GDPR)

---

## Categories (Updated)
| Category | Icon |
|----------|------|
| Trasporto | car |
| Spesa | cart |
| Tecnologia | laptop |
| Pulizie | home |
| Compagnia | people |
| Cucina | restaurant |
| Giardinaggio | leaf |
| Babysitting | happy |
| Animali | paw |
| Ripetizioni | school |
| Altro | ellipsis-horizontal |

---

## Current Priority Tasks

### P0 (Blockers)
- [ ] Fix CocoaPods issue on user's Mac

### P1 (High Priority)
- [ ] Clarify "Offline Notice" update request
- [ ] Test onboarding flow
- [ ] Test photo upload fix

### P2 (Medium Priority)
- [ ] Build for TestFlight
- [ ] Build APK for Android

---

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, TypeScript
- **Backend**: FastAPI, Motor (MongoDB async)
- **Database**: MongoDB
- **Payments**: Stripe (emergentintegrations)
- **Auth**: JWT + Google/Apple OAuth

---

## Test Account
- **Email**: reviewer@test.com
- **Password**: review123

---

## API Endpoints
- Backend: `https://granelli-app-1.preview.emergentagent.com`
- Health: `/api/health`
- Download ZIP: `/api/download/frontend`
