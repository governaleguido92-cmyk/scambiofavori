# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Core Concept
- **Valuta**: Granelli (💎) - Bonus benvenuto: 3 Granelli
- **Sistema**: Scambio favori tramite QR code con geofencing (100m)
- **Privacy**: Posizioni approssimative, non indirizzi esatti

## Funzionalità Implementate (Febbraio 2026)

### ✅ UI/UX Rinnovata
- **Nuova Palette Colori**:
  - Verde Bosco (#2D5A3D) - Colore primario
  - Arancio Caldo (#E07B39) - Colore accento
- **Card Favori Moderne**:
  - Icone categoria grandi
  - Avatar autore con iniziale
  - Design con bordi e ombre
- **Tab Bar Aggiornata**: Home, Mappa, Crea, I Miei, Profilo

### ✅ Mappa Favori
- Nuova tab "Mappa" nella navigazione
- Visualizzazione favori con cerchi di prossimità
- Filtri per tipo (Tutti/Offerte/Richieste)
- Banner privacy per posizioni approssimative
- File: `frontend/app/(tabs)/map.tsx`

### ✅ Chat In-App
- Chat attiva solo dopo accettazione favore
- Apertura automatica chat dopo accettazione
- Filtro anti-denaro (blocca euro, contanti, pagamento, etc.)
- Banner permanente "Non scambiare denaro"
- File: `frontend/app/chat/[favorId].tsx`

### ✅ Sistema Gamification
- **Barra Impatto Sociale** nel profilo
- **Badge** ("Eroe di Quartiere", etc.)
- **Livelli** basati su Community Score
- Rating con stelle e tag etici

### ✅ Sistema Notifiche per Competenze
- Campo `skills` nel profilo utente
- Notifiche automatiche quando un favore corrisponde alle competenze
- API: `PUT /api/user/skills`, `GET /api/notifications`
- File: `backend/server.py` (linee 2112-2200)

### ✅ Sistema Social Debt
- Limite debito: -3 Granelli
- Modal avviso, banner, bottone disabilitato
- Evidenziazione offerte utenti in debito nel feed

### ✅ Durata Annunci
- Validità configurabile (1-10 giorni)
- Scadenza automatica annunci
- Selettore UI nella creazione favore

## Schema Database

### users
```json
{
  "user_id": "string",
  "email": "string",
  "granelli": "int",
  "skills": ["string"],  // Competenze
  "notifications_enabled": "bool",
  "social_impact_score": "int"
}
```

### notifications
```json
{
  "notification_id": "string",
  "user_id": "string",
  "type": "skill_match | favor_update | system",
  "title": "string",
  "message": "string",
  "favor_id": "string?",
  "read": "bool"
}
```

## API Endpoints Principali

### Auth
- `POST /api/auth/register` - Registrazione
- `POST /api/auth/login` - Login

### Favori
- `POST /api/favors` - Crea favore (con notifiche skill match)
- `GET /api/favors` - Lista favori (filtra scaduti)
- `POST /api/favors/accept` - Accetta favore

### Chat
- `POST /api/messages` - Invia messaggio (con filtro denaro)
- `GET /api/messages/{favor_id}` - Leggi messaggi

### Skills & Notifiche
- `PUT /api/user/skills` - Aggiorna competenze
- `GET /api/user/skills` - Leggi competenze
- `GET /api/notifications` - Lista notifiche
- `GET /api/notifications/unread-count` - Conteggio non lette

## Architettura

```
/app
├── backend/
│   └── server.py          # FastAPI + MongoDB
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx   # Home con nuovi colori
│   │   │   ├── map.tsx     # NUOVA Mappa
│   │   │   ├── create.tsx  # Creazione con validità
│   │   │   └── profile.tsx # Profilo con impatto
│   │   └── chat/
│   │       └── [favorId].tsx # Chat protetta
│   └── src/
│       └── theme/
│           └── colors.ts   # NUOVO Tema colori
```

## Test Coverage
- 33+ test cases backend passati
- Skills API testata e funzionante
- Notifiche API testata e funzionante

## Backlog (P2)

### Schermata Valutazione Obbligatoria
- Creare `frontend/app/review.tsx`
- Navigazione forzata post-completamento

### Integrazione Mappa Reale
- Implementare react-native-maps con OpenStreetMap
- Marker interattivi per favori

### UI Fondo Solidarietà
- Interfaccia richiesta "regalo" per recupero debito

## Note Tecniche
- Preview URL: https://favor-exchange-5.preview.emergentagent.com
- Credenziali test: test_chat@test.com / test123
