# Scambio di Favori - PRD

## Original Problem Statement
Mobile app "Scambio di Favori" - hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Architecture
- **Frontend**: Expo SDK 55 / React Native (web + mobile)
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT + Google/Apple OAuth
- **Email**: Resend (verification, password reset, username recovery)
- **Payments**: Stripe (Sostenitori subscription)
- **Push**: Expo Push Notifications

## Implemented Features
- [x] Registration with email verification (Resend)
- [x] Password recovery with email code
- [x] Username recovery with email code
- [x] JWT + Google/Apple login
- [x] Favor CRUD + accept/complete with QR
- [x] Granelli currency (3 starting, social debt)
- [x] Profile completion bar (4 steps × 25%)
- [x] Push notifications (5 trigger types)
- [x] Notification preferences (5 toggles)
- [x] Compact favor cards, 4-color palette
- [x] Sostenitori subscription (Stripe)
- [x] Reporting system

## Recovery Endpoints
- POST /api/auth/forgot-password → sends reset code
- POST /api/auth/reset-password → verifies code, resets password
- POST /api/auth/recover-username → sends verification code
- POST /api/auth/verify-username-recovery → returns username

## Credentials
- Test: reviewer@test.com / review123

## Upcoming Tasks (P1)
- Verify Resend domain for production emails
- GDPR hard-delete account
- Onboarding slides verification

## Future Tasks (P2)
- Map view for nearby favors
- Anti-fraud limits
- Offline notices
