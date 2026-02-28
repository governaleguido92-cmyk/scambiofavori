# Scambio di Favori - Product Requirements Document

## Original Problem Statement
Build a mobile application "Scambio di Favori" (Favor Exchange), a hyperlocal community platform for exchanging favors using in-app currency ("Granelli").

## Recent Changes (Feb 28, 2026)

### Session Summary

#### 1. User Profile Visibility ✅
- All users can view other users' public profiles
- Profile shows: name, title, badges, skills, stats, reviews received
- Privacy: no email, no location shared in public profile

#### 2. Favor Date/Time Display ✅
- Creation date and time visible on favor detail page
- Format: "Creato il 28 febbraio 2026, 14:30"

#### 3. Report Favor Button ✅
- Flag icon in header to report favors
- Uses existing ReportModal component
- Allows users to report inappropriate content

#### 4. Offensive Language Filter ✅
- Already implemented in backend (`contains_offensive_language`)
- Filters chat messages automatically
- Blocks money references and inappropriate content

#### 5. Stars Layout Fixed ✅
- Changed from horizontal (cramped) to vertical layout
- Each rating on its own row with label on left, stars on right
- Better readability and spacing

## API Endpoints (New)
- `GET /api/users/{user_id}/public` - Get public profile of any user

## Technical Changes
- `frontend/app/favor/[id].tsx`: Added profile modal, report button, date display, improved styles
- `frontend/src/services/api.ts`: Added `getUserPublicProfile` function
- `backend/server.py`: Added `/users/{user_id}/public` endpoint

## Build Instructions
Download: `https://granelli-app-1.preview.emergentagent.com/api/download/frontend`

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`

## Backlog
- Real email verification integration
- Offline Notice update (needs user clarification)
