# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Core Concept
- **Valuta**: Granelli (💎) - Bonus benvenuto: 3 Granelli
- **Sistema**: Scambio favori tramite QR code con geofencing (100m)
- **Privacy**: Posizioni approssimative, non indirizzi esatti

## Funzionalità Implementate (Febbraio 2026)

### ✅ Sezione Legale & GDPR Compliance

#### 1. Pagina Note Legali (`/legal`)
- **Termini di Servizio (ToS)**:
  - Natura della piattaforma (intermediario)
  - Esonero responsabilità
  - Divieto scambio denaro (ban permanente)
  - Obblighi dell'utente
- **Privacy Policy** (GDPR Compliant):
  - Dati raccolti (email, GPS, utilizzo)
  - Uso dati GPS (solo raggio approssimativo)
  - Conservazione dati
  - Diritti utente (accesso, rettifica, cancellazione, portabilità)

#### 2. Workflow Consenso
- Modal obbligatorio post-registrazione/login
- Checkbox "Ho letto e accetto ToS e Privacy"
- Campo `legal_accepted` nel database
- Blocco funzioni se non accettato

#### 3. Diritto all'Oblio (GDPR Art. 17)
- Pulsante "Elimina Account" in Impostazioni
- Alert conferma con email
- Cancellazione definitiva:
  - Email e dati personali
  - Messaggi chat
  - Notifiche
  - Invalidazione Granelli
- Anonimizzazione favori per storico

#### 4. Banner Etico
- Testo nel form creazione: "Pubblicando, confermi che il favore rispetta i nostri standard etici e di sicurezza"

### ✅ UI/UX Rinnovata
- **Nuova Palette Colori**:
  - Verde Bosco (#2D5A3D) - primario
  - Arancio Caldo (#E07B39) - accento
- **Card Favori Moderne** con avatar autore
- **Tab Bar**: Home, Mappa, Crea, I Miei, Profilo

### ✅ Mappa Favori
- Tab "Mappa" con cerchi di prossimità
- Filtri tipo (Tutti/Offerte/Richieste)
- Banner privacy posizioni

### ✅ Chat In-App
- Chat post-accettazione
- Filtro anti-denaro automatico
- Banner permanente anti-denaro

### ✅ Sistema Notifiche Competenze
- Campo `skills` utente
- Notifiche matching favori ↔ competenze

### ✅ Sistema Social Debt
- Limite: -3 Granelli
- Modal avviso, blocco richieste
- Evidenziazione offerte utenti in debito

### ✅ Durata Annunci
- Validità 1-10 giorni
- Scadenza automatica

## API Endpoints

### Legal & GDPR
- `GET /api/legal/status` - Stato accettazione
- `POST /api/legal/accept` - Accetta termini
- `DELETE /api/account` - Elimina account (GDPR)

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Favori & Chat
- `POST /api/favors`
- `GET /api/favors`
- `POST /api/messages`
- `GET /api/messages/{favor_id}`

### Skills & Notifiche
- `PUT /api/user/skills`
- `GET /api/notifications`

## File Struttura

```
/app
├── backend/
│   └── server.py              # API + GDPR endpoints
├── frontend/
│   ├── app/
│   │   ├── legal.tsx          # Pagina Note Legali
│   │   ├── (tabs)/
│   │   │   ├── index.tsx      # Home
│   │   │   ├── map.tsx        # Mappa
│   │   │   ├── create.tsx     # Crea + banner etico
│   │   │   └── profile.tsx    # Profilo
│   │   └── _layout.tsx        # Layout + Legal Modal
│   └── src/
│       ├── components/
│       │   └── LegalConsentModal.tsx
│       ├── context/
│       │   └── AuthContext.tsx  # + legal state
│       ├── services/
│       │   └── api.ts           # + legal/delete APIs
│       └── theme/
│           └── colors.ts
```

## Test API Results

```
Legal Status: {"legal_accepted":false} ✅
Accept Legal: {"message":"Termini e condizioni accettati"} ✅
After Accept: {"legal_accepted":true} ✅
```

## Backlog (P2)

### Schermata Valutazione Obbligatoria
- UI rating post-completamento favore

### Integrazione Mappa Reale
- react-native-maps con OpenStreetMap

### UI Competenze nel Profilo
- Selezione categorie expertise

## Note Tecniche
- Preview: https://favor-exchange-5.preview.emergentagent.com
- Test user: test_chat@test.com / test123
