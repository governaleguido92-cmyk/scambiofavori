# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Funzionalità Chat Avanzata (Febbraio 2026)

### 1. Logica di Attivazione
- ✅ Chat creata automaticamente dopo accettazione favore
- ✅ Chat "Sola Lettura" dopo 24h dal completamento/annullamento
- API: `GET /api/chat/status/{favorId}` - ritorna `read_only: true/false`

### 2. Moderazione Anti-Abuso

#### Filtro Parole Chiave
- **Denaro** (bloccato): euro, pagamento, bonifico, prezzo, contanti, paypal, iban, carta
- **Linguaggio Offensivo** (bloccato): lista di parolacce italiane
- **Link Sospetti** (bloccato): tutti tranne Google Maps/OpenStreetMap

#### Alert Privacy
- Quando si condividono telefono/email, appare warning:
  - "Stai condividendo dati personali. Assicurati di fidarti del tuo vicino."

### 3. Funzionalità Meeting Point
- Tasto "Invia Punto di Incontro" per condividere luoghi pubblici
- Evita condivisione indirizzo privato

### 4. Sistema Segnalazioni (Safety First)
- **Tasto Report**: Sempre visibile nell'header chat
- **Motivi segnalazione**:
  - Linguaggio offensivo
  - Richiesta di denaro
  - Spam
  - Comportamento inappropriato
  - Altro
- **Shadow Ban**: Automatico dopo 5+ segnalazioni confermate
- API: `POST /api/chat/report`

### 5. UI/UX Chat
- **Colori**: Verde Bosco (#2D5A3D) + Arancio (#E07B39)
- **Header**: Titolo favore + Valore Granelli
- **Banner Etico**: "Lo scambio è basato sul tempo, non sul denaro"
- **Avatar**: Iniziale nome utente
- **Messaggi bloccati**: Badge rosso "Bloccato"

## Test API Chat

```bash
# Filtro denaro ✅
"Pagami 50 euro" → BLOCCATO

# Filtro offensivo ✅  
"Sei uno stronzo" → BLOCCATO

# Warning dati personali ✅
"Chiamami: 333-1234567" → OK + Warning

# Link sospetti ✅
"Vai su http://scam.com" → BLOCCATO

# Messaggio normale ✅
"Ci vediamo domani!" → OK
```

## Struttura File

```
Backend:
- server.py lines 76-140: Filtri (MONEY_FILTER_PATTERNS, OFFENSIVE_PATTERNS, PERSONAL_DATA_PATTERNS)
- server.py lines 1895-2040: Endpoint messaggi con filtri
- server.py lines 2042-2120: Endpoint report e chat status

Frontend:
- app/chat/[favorId].tsx: UI completa con report, meeting point, alerts
```

## Schema Database

### messages
```json
{
  "message_id": "string",
  "favor_id": "string",
  "sender_id": "string",
  "content": "string",
  "message_type": "text | meeting_point | image",
  "blocked": "bool",
  "block_reason": "money | offensive | link",
  "has_personal_data": "bool"
}
```

### reports
```json
{
  "report_id": "string",
  "favor_id": "string",
  "reporter_id": "string",
  "reported_user_id": "string",
  "reason": "offensive | money_request | spam | inappropriate | other",
  "status": "pending | confirmed | dismissed"
}
```

## Altre Funzionalità Implementate

### Sezione Legale & GDPR
- Pagina Note Legali (`/legal`)
- Modal consenso obbligatorio
- Diritto all'Oblio (DELETE /api/account)

### UI/UX
- Palette Verde Bosco + Arancio Caldo
- Card favori moderne
- Tab Mappa

### Sistema Notifiche Competenze
- Matching favori ↔ skills utente

### Sistema Social Debt
- Limite -3 Granelli
- Evidenziazione utenti in debito

## Note Tecniche
- Preview: https://granelli-app.preview.emergentagent.com
- Test user: test_chat@test.com / test123
