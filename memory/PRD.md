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

## Recent Changes (Feb 28, 2026)

### Privacy & UI Updates
1. **Profilo**: Rimosso "Micro-Favori" dalla sezione "Come funzionano i Granelli"
2. **Creazione Favori**: L'indirizzo non viene più mostrato nella UI, solo salvato per la mappa
3. **Dettaglio Favori**: Rimossa la card location - l'indirizzo è visibile solo sulla mappa
4. **Home Feed**: Rimossa la distanza dalle card favori per privacy

### QR Scanner Fix
- Corretto errore `NameError: create_secure_transaction` nel backend
- Migliorata gestione errori di rete nel frontend con messaggi più chiari
- Aggiunto pulsante "Riprova" in caso di errore scansione

### Notifiche Recensioni (NEW)
- Notifica quando ricevi una recensione: "⭐ Nuova Recensione!"
- Notifica quando entrambi hanno recensito: "🎉 Ciclo Completato!"

### Code Changes
- `backend/server.py`: Fix chiamata a `log_security_transaction`
- `frontend/app/(tabs)/profile.tsx`: Rimossa sezione micro-favori
- `frontend/app/(tabs)/create.tsx`: Nuova UI privacy location
- `frontend/app/(tabs)/index.tsx`: Rimossa distanza dalle card
- `frontend/app/favor/[id].tsx`: Rimossa location card, migliorato error handling QR

## Key API Endpoints
- `POST /api/auth/login` - User login
- `POST /api/favors` - Create favor
- `POST /api/favors/{id}/verify-qr` - Complete favor via QR scan
- `GET /api/download/frontend` - Download frontend ZIP

## Build Instructions
1. Download: `https://granelli-app-1.preview.emergentagent.com/api/download/frontend`
2. Extract and run:
   ```bash
   cd ~/Downloads
   unzip scambio-di-favori-frontend.zip -d scambio-frontend
   cd scambio-frontend/frontend
   yarn install
   npx expo prebuild --platform ios --clean
   cd ios && pod install --repo-update && cd ..
   open ios/scambiodifavori.xcworkspace
   ```

## Test Credentials
- Email: `reviewer@test.com`
- Password: `review123`

## Pending Items
- User verification of all recent changes on device
- Offline Notice update (needs user clarification)
