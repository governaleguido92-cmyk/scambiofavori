# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Core Concept
- **Valuta**: Granelli (💎) - Bonus benvenuto: 3 Granelli
- **Sistema**: Scambio favori tramite QR code con geofencing (100m)
- **Privacy**: Posizioni approssimative, non indirizzi esatti

## Funzionalità Implementate

### ✅ Completate (Dicembre 2025)

#### 1. Chat In-App
- Messaggistica tra partecipanti di un favore
- **Filtro Anti-Denaro**: Blocca automaticamente riferimenti a transazioni monetarie (euro, contanti, pagamento, bonifico, iban, paypal, etc.)
- Endpoint: `POST /api/messages`, `GET /api/messages/{favor_id}`
- File: `frontend/app/chat/[favorId].tsx`

#### 2. Sistema Social Debt
- **Limite Debito**: -3 Granelli
- **Restrizioni**: Utenti in debito non possono creare nuove richieste
- **UI**: Modal informativo, banner avviso, bottone disabilitato
- **Evidenziazione Feed**: Offerte da utenti in debito mostrate con badge priorità
- File: `frontend/app/(tabs)/create.tsx`, `frontend/app/(tabs)/index.tsx`

#### 3. Sistema Valutazione
- Rating stelle + Tag Etici
- Barra Impatto Sociale nel profilo
- Bacheca dei Grazie

#### 4. Navigazione Chat
- Bottone chat nella schermata dettagli favore
- Screen chat integrato nel router Expo

### Backend
- FastAPI + MongoDB
- JWT Authentication
- Geofencing QR code verification
- Social debt automatic calculation

### Frontend
- React Native + Expo
- Expo Router (file-based navigation)
- AuthContext per gestione stato utente

## Schema Database Chiave

### users
```json
{
  "user_id": "string",
  "email": "string", 
  "granelli": "int (default: 3)",
  "reliability_score": "float (1-5)",
  "social_impact_score": "int",
  "in_debt_recovery": "bool"
}
```

### favors
```json
{
  "favor_id": "string",
  "creator_id": "string",
  "type": "offer | request",
  "status": "active | accepted | completed | cancelled",
  "creator_in_debt": "bool",
  "granelli_cost": "int"
}
```

### messages
```json
{
  "message_id": "string",
  "favor_id": "string",
  "sender_id": "string",
  "content": "string",
  "blocked": "bool",
  "is_system": "bool"
}
```

## Test Coverage
- 33 test cases passati (100% backend)
- Test file: `/app/backend/tests/test_chat_and_debt.py`

## Backlog (P1)

### Schermata Valutazione Obbligatoria
- Creare `frontend/app/review.tsx`
- Navigazione post-completamento favore
- Tag etici obbligatori

### Badge UI
- Badge "Eroe di Quartiere" 
- Visualizzazione badge nel profilo

### Fondo Solidarietà UI
- Richiesta "regalo" per recupero debito
- Interfaccia amministrativa

## Note Tecniche
- URL Preview: https://favor-exchange-5.preview.emergentagent.com
- Expo Web ha limitazioni per testing automatizzato
- Hot reload attivo per frontend e backend
