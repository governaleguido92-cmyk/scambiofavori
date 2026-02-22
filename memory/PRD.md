# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Funzionalità Implementate

### 1. Sistema Core
- **Autenticazione**: JWT-based + Google OAuth
- **Valuta Granelli**: 3 di benvenuto, 1 per ora di favore
- **Favori**: Creazione, accettazione, completamento con QR code
- **Social Debt**: Limite -3 Granelli, blocco richieste se in debito

### 2. Chat Avanzata
- Chat creata automaticamente dopo accettazione favore
- Chat "Sola Lettura" dopo 24h dal completamento/annullamento
- **Moderazione Anti-Abuso**:
  - Filtro parole chiave denaro (euro, pagamento, bonifico, ecc.)
  - Filtro linguaggio offensivo
  - Alert privacy per condivisione dati personali
- Funzionalità "Meeting Point" per condivisione luoghi pubblici
- Sistema segnalazioni con shadow ban

### 3. Legal & GDPR (Febbraio 2026)
- Pagina Note Legali (`/legal`)
- Modal consenso obbligatorio al primo login
- Diritto all'Oblio (DELETE /api/account)
- Disclaimer: "L'app è un facilitatore e non risponde della condotta degli utenti"

### 4. Sicurezza Anti-Frode (Febbraio 2026)
- Limite 10 ore scambi/giorno per utente
- Logging transazioni QR per dispute resolution
- Geofencing 100m per conferma scambio

### 5. Mappa Favori (Febbraio 2026)
- Tab Mappa nella navigazione
- Visualizzazione favori come cerchi di prossimità (privacy)
- Filtri per tipo (Tutti/Offerte/Richieste)
- Legenda colori
- API: GET /api/favors con parametri latitude, longitude, max_distance_km

### 6. Gestione Competenze Utente (Febbraio 2026) - NUOVO
- Sezione "Le Tue Competenze" nel profilo
- UI per visualizzare competenze selezionate come tag
- Modal per selezionare/deselezionare competenze
- Sincronizzazione con backend via API
- **API Endpoints**:
  - GET /api/user/skills - recupera competenze
  - PUT /api/user/skills - aggiorna competenze
- **Frontend Files**:
  - `profile.tsx`: Lines 31-75 (state), 350-420 (UI), 690-780 (modal)
- **Test**: 12/12 test passati (backend)

## Schema Database

### users
```json
{
  "user_id": "string",
  "email": "string",
  "name": "string",
  "granelli": "int",
  "skills": ["string"],  // Lista competenze
  "legal_accepted": "bool",
  "legal_accepted_at": "datetime",
  "reliability_score": "float",
  "social_impact_score": "int"
}
```

### favors
```json
{
  "favor_id": "string",
  "creator_id": "string",
  "type": "offer|request",
  "title": "string",
  "category": "string",
  "granelli_cost": "int",
  "validity_days": "int",
  "expires_at": "datetime",
  "status": "active|accepted|completed|cancelled"
}
```

### notifications
```json
{
  "notification_id": "string",
  "user_id": "string",
  "favor_id": "string",
  "message": "string",
  "is_read": "bool"
}
```

### security_logs
```json
{
  "log_id": "string",
  "transaction_hash": "string",
  "favor_id": "string",
  "timestamp": "datetime",
  "gps_latitude": "float",
  "gps_longitude": "float"
}
```

## Architettura

```
/app
├── backend/
│   ├── server.py          # FastAPI, tutti gli endpoint
│   └── tests/
│       └── test_skills_api.py  # Test competenze
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── home.tsx       # Feed favori
│   │   │   ├── map.tsx        # Mappa favori
│   │   │   ├── create.tsx     # Creazione favori
│   │   │   └── profile.tsx    # Profilo con competenze
│   │   ├── chat/[favorId].tsx # Chat per favore
│   │   └── legal.tsx          # Pagina legale
│   └── src/
│       ├── services/api.ts    # Client API
│       ├── context/AuthContext.tsx
│       └── theme/colors.ts    # Verde Bosco + Arancio
└── memory/
    └── PRD.md
```

## Colori UI
- **Primary (Verde Bosco)**: #2D5A3D
- **Accent (Arancio Caldo)**: #E07B39
- **Background**: #0F1A14
- **Text Primary**: #FFFFFF

## Test Credentials
- Email: skills_test@test.com
- Password: test123

## Prossimi Task (Backlog)

### P2: UI Notifiche
- Icona campanella nell'header con badge contatore
- Schermata lista notifiche
- Polling endpoint /api/notifications

### P3: Miglioramenti UX
- Ottimizzazione performance mappa
- Animazioni transizione pagine

## Note Tecniche
- Preview URL: https://granelli-app.preview.emergentagent.com
- Backend: FastAPI su porta 8001
- Frontend: Expo React Native con web support
- Database: MongoDB
