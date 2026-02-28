# Scambio di Favori - PRD

## Original Problem Statement
Mobile app "Scambio di Favori" - hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Architecture
- **Frontend**: Expo/React Native (web + mobile)
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT + Google/Apple OAuth
- **Email**: Resend (transactional email for verification)
- **Payments**: Stripe (Sostenitori subscription €1/month)

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

## Completed (Feb 28, 2026)
- Optimized favor card layout (compact, single-line title/description)
- Updated 4-color theme palette across entire app
- Integrated Resend email service for real email verification
- Fixed ReportModal import in favor detail page
- Fixed useFocusEffect navigation error on web
- Backend: 14/14 tests passed
- Frontend: 100% features working

## Known Limitations
- Resend API in TEST MODE - emails only sent to owner address
- expo-camera limited on web platform

## Credentials
- Test: reviewer@test.com / review123
- Resend: re_QKEG5Z5s_NQMuz2AnQEbAaKUZANsHi4Fj (test mode)

## Upcoming Tasks (P1)
- Verify Resend domain for production emails
- Onboarding slides verification with new user
- GDPR hard-delete account feature

## Future Tasks (P2)
- Map view for nearby favors
- Offline notices
- Push notifications
- Anti-fraud limits
