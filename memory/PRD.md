# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Store Compliance Status: READY ✅

### App Store / Google Play Requirements Implemented

#### 1. UGC Safety (User Generated Content)
- **Sistema Segnalazioni**: POST /api/report per favori e utenti
- **Blocco Utenti Bidirezionale**: Utenti bloccati non si vedono reciprocamente
- **Moderazione Automatica**: Filtri anti-link sospetti e linguaggio offensivo nella creazione favori
- **Auto-moderazione**: 5+ segnalazioni = nascondi contenuto/shadow ban utente

#### 2. Account Management & GDPR
- **Diritto all'Oblio**: DELETE /api/account (hard delete completo)
- **Privacy Strings**: Messaggi chiari per richiesta permessi (posizione, fotocamera)
- **Consenso Legale**: Modal obbligatorio al primo login

#### 3. Reviewer Mode (Apple/Google Testing)
- **Account Reviewer**: reviewer@test.com con funzionalità debug
- **Mock QR Scan**: Simula completamento favore senza QR fisico
- **Mock GPS**: Per testare geofencing da remoto

#### 4. UX & Performance
- **Skeleton Screens**: Loading placeholder per feed e mappa
- **Offline Mode**: Banner "Sei offline" con retry
- **Feedback Errori**: Messaggi specifici per QR scaduto/non valido

## Funzionalità Core

### Sistema Economico
- **Granelli**: 3 di benvenuto, 1 per ora
- **Social Debt**: Limite -3, blocco richieste se in debito
- **Limite Anti-Frode**: Max 10 scambi/giorno

### Favori
- Creazione offerte/richieste con durata configurabile (max 10 giorni)
- Conferma via QR code con geofencing 100m
- Security logging per dispute resolution

### Chat Avanzata
- Attivazione automatica dopo accettazione
- Sola lettura dopo 24h dal completamento
- Filtri: denaro, linguaggio offensivo, dati personali
- "Meeting Point" per condivisione luoghi pubblici
- Sistema segnalazioni con shadow ban

### Profilo & Gamification
- **Barra Completamento Profilo**: 4 item (nome, foto, competenze, primo favore) = badge
- **Competenze**: Selezione categorie per notifiche mirate
- **Badge Comunitari**: Sbloccabili con attività
- **Social Impact Bar**: Visualizzazione impatto nella community

### Mappa
- Visualizzazione favori nelle vicinanze
- Cerchi di prossimità per privacy
- Filtri per tipo (offerte/richieste)

## API Endpoints

### Autenticazione
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/google (OAuth)

### Favori
- GET /api/favors (con filtri posizione)
- POST /api/favors (con moderazione contenuti)
- POST /api/favors/{id}/complete (QR + geofencing)

### Reporting & Blocking (NEW)
- POST /api/report (segnala favori/utenti)
- POST /api/users/block
- DELETE /api/users/block/{user_id}
- GET /api/users/blocked

### Profilo
- GET /api/users/me/profile-completion
- GET/PUT /api/user/skills
- DELETE /api/account (GDPR)

### Debug/Reviewer (NEW)
- GET /api/debug/is-reviewer
- POST /api/debug/mock-qr-scan

## Schema Database

```
users:
  - user_id, email, name, password_hash
  - granelli, is_in_debt
  - skills[], badges[]
  - legal_accepted, legal_accepted_at
  - banned_from_chat, shadow_banned
  
favors:
  - favor_id, creator_id, type
  - title, description, category
  - granelli_cost, validity_days, expires_at
  - status, accepted_by, completed_at
  
general_reports (NEW):
  - report_id, reporter_id
  - report_type (favor/user)
  - target_id, reason, description
  - status, created_at
  
blocked_users (NEW):
  - block_id, blocker_id, blocked_id
  - reason, created_at
  
security_logs:
  - log_id, transaction_hash
  - favor_id, timestamp
  - gps_latitude, gps_longitude
```

## File Structure

```
/app
├── backend/
│   ├── server.py           # FastAPI + tutti gli endpoint
│   └── tests/
│       ├── test_skills_api.py
│       └── test_store_compliance.py
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login.tsx    # + Apple placeholder
│   │   ├── (tabs)/
│   │   │   ├── index.tsx    # + ReportModal
│   │   │   ├── profile.tsx  # + ProfileCompletionBar
│   │   │   └── map.tsx
│   └── src/
│       ├── components/
│       │   ├── ReportModal.tsx     # NEW
│       │   ├── ProfileCompletionBar.tsx # NEW
│       │   ├── Skeleton.tsx        # NEW
│       │   ├── OfflineNotice.tsx   # NEW
│       │   └── LegalConsentModal.tsx
│       ├── services/api.ts
│       └── theme/colors.ts
└── memory/PRD.md
```

## Test Credentials

| Account | Email | Password | Scopo |
|---------|-------|----------|-------|
| Test User | skills_test@test.com | test123 | Testing generale |
| Reviewer | reviewer@test.com | review123 | Debug mode per store review |

## Testing Status

### Backend: 100% ✅
- 22/22 test Store Compliance passati
- 12/12 test Skills API passati

### Frontend: Verificato via Code Review ✅
- Tunnel ngrok instabile impedisce E2E completo
- Tutti i componenti implementati e importati correttamente

## Prossimi Passi

### P1: UI Notifiche
- Icona campanella con badge contatore
- Schermata lista notifiche
- Polling /api/notifications

### P2: Ottimizzazioni
- Performance mappa
- Caching API responses
- Compressione immagini

## Note per Deployment

1. **REVIEWER_MODE_ENABLED**: Settare `False` in produzione
2. **REVIEWER_EMAIL**: Cambiare email per account reviewer reale
3. **Rate Limiting**: Considerare implementazione per API pubbliche
