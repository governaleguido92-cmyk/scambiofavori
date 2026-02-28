# Scambio di Favori - PRD

## Original Problem Statement
Mobile app "Scambio di Favori" - hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Architecture
- **Frontend**: Expo/React Native (web + mobile)
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT + Google/Apple OAuth
- **Email**: Resend (transactional email for verification)
- **Payments**: Stripe (Sostenitori subscription)
- **Push**: Expo Push Notifications (via Expo Push API)

## Color Theme (4 Colors)
- Verde Bosco (#2D5A3D) - Primary
- Arancio Caldo (#E07B39) - Accent
- Oro (#FFD700) - Granelli currency
- Bianco (#FFFFFF) - Text

## Implemented Features
- [x] User registration with email verification (Resend)
- [x] JWT + Google/Apple login
- [x] Favor posting, accepting, completing
- [x] Granelli currency system (3 starting)
- [x] Social debt mechanism
- [x] QR code confirmation
- [x] User profiles with reviews
- [x] Public profile view
- [x] Reporting system (favors/users)
- [x] Category filtering
- [x] Thanks board
- [x] Sostenitori subscription (Stripe)
- [x] Compact favor cards (optimized spacing)
- [x] 4-color palette applied
- [x] Onboarding slides for new users
- [x] Push Notifications (Expo Push)
- [x] Notification Preferences (profile toggle switches)

## Push Notification System
**Trigger Points:**
- Favor accepted → notify creator
- Favor completed → notify helper & receiver
- New review → notify reviewed user
- New message → notify recipient
- Skill match → notify matching users

**User Preferences (5 toggles in Profile):**
- Favore accettato
- Favore completato
- Nuovi messaggi
- Nuove recensioni
- Match competenze

**API Endpoints:**
- POST /api/push-token - Register device token
- DELETE /api/push-token - Remove token (logout)
- GET /api/notification-preferences - Get user preferences
- PUT /api/notification-preferences - Update preferences

## Completed (Feb 28, 2026)
- Optimized favor card layout (compact)
- Updated 4-color theme palette
- Integrated Resend email for verification
- Fixed ReportModal import in favor detail
- Fixed useFocusEffect navigation error
- Expo Push Notifications (hook + backend + Expo Push API)
- Notification preferences with Switch toggles in profile
- Backend respects user preferences before sending push
- All tests passing (backend 17+/17)

## Credentials
- Test: reviewer@test.com / review123
- Resend: re_QKEG5Z5s_NQMuz2AnQEbAaKUZANsHi4Fj (test mode)

## Upcoming Tasks (P1)
- Verify Resend domain for production emails
- Onboarding slides verification
- GDPR hard-delete account

## Future Tasks (P2)
- Map view for nearby favors
- Anti-fraud limits
- Offline notices
