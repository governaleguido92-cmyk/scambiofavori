# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Store Compliance Status: READY ✅
## Monetization: SUPPORTER SYSTEM ACTIVE ✅

---

## NUOVO: Sistema Sostenitori "Pilastro della Community"

### Panoramica
Sistema di micro-sostegno ricorrente per coprire i costi dell'app e premiare i sostenitori.

### Pricing
- **Piano Unico**: 1€/mese (cancellabile in qualsiasi momento)

### Benefici Sostenitori
- **Badge Cuore Dorato**: Icona ❤️ dorata accanto al nome ovunque nell'app
- **Bordo Profilo Dorato**: Foto profilo con cornice dorata distintiva
- **Visibilità Mappa**: Profilo evidenziato sulla mappa
- **Badge "Sostenitore"**: Badge permanente nel profilo

### Implementazione Tecnica

#### Backend Endpoints
```
POST /api/subscription/create-checkout   → Crea sessione Stripe Checkout
GET  /api/subscription/my-status         → Stato abbonamento utente
GET  /api/subscription/status/{session}  → Verifica pagamento
GET  /api/subscription/manage-url        → URL Customer Portal Stripe
POST /api/webhook/stripe                 → Webhook eventi Stripe
```

#### Database Schema (nuovi campi users)
```json
{
  "is_supporter": "bool",
  "subscription_status": "active|cancelled|null",
  "subscription_id": "string",
  "supporter_since": "datetime"
}
```

#### Frontend
- **Pagina /supporter**: UI completa con messaggio emozionale, benefici, checkout
- **SupporterBadge.tsx**: Componenti badge e bordo dorato riutilizzabili
- **ProfileCompletionBar**: Link "Sostieni il Progetto" nel profilo

### Integrazione Stripe
- **Libreria**: emergentintegrations.payments.stripe.checkout
- **Test Key**: sk_test_emergent (ambiente)
- **Webhook**: Gestisce checkout.session.completed, subscription.deleted, invoice.payment_failed

### Privacy
- Solo lo stato "Sostenitore" è visibile, mai l'importo donato

---

## Funzionalità Complete

### 1. Sistema Core
- **Autenticazione**: JWT + Google OAuth + Placeholder Apple
- **Valuta Granelli**: 3 di benvenuto, 1 per ora
- **Favori**: CRUD con expiration (max 10 giorni)
- **Social Debt**: Limite -3, blocco richieste

### 2. Store Compliance
- **UGC Safety**: Report contenuti, blocco utenti bidirezionale
- **Moderazione**: Filtri anti-link/linguaggio offensivo
- **GDPR**: Diritto all'oblio, consenso legale
- **Reviewer Mode**: Mock QR/GPS per tester Apple/Google

### 3. Chat Avanzata
- Auto-attivazione dopo accettazione
- Sola lettura post 24h
- Filtri: denaro, offensivo, PII
- Meeting Point, Report, Shadow Ban

### 4. Gamification
- Barra Completamento Profilo (4 item = badge)
- Competenze utente con notifiche
- Social Impact Bar
- Leaderboard community

### 5. Mappa
- Favori nelle vicinanze
- Cerchi prossimità (privacy)
- Filtri tipo

---

## API Reference

### Autenticazione
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/google

### Favori
- GET /api/favors
- POST /api/favors (con moderazione)
- POST /api/favors/{id}/complete

### Reporting & Blocking
- POST /api/report
- POST /api/users/block
- DELETE /api/users/block/{user_id}
- GET /api/users/blocked

### Profilo
- GET /api/users/me/profile-completion
- GET/PUT /api/user/skills
- DELETE /api/account

### Subscription (NEW)
- POST /api/subscription/create-checkout
- GET /api/subscription/my-status
- GET /api/subscription/status/{session_id}
- GET /api/subscription/manage-url
- POST /api/webhook/stripe

### Debug/Reviewer
- GET /api/debug/is-reviewer
- POST /api/debug/mock-qr-scan

---

## File Structure

```
/app
├── backend/
│   ├── server.py           # FastAPI + Stripe + tutti gli endpoint
│   ├── .env                 # MONGO_URL, DB_NAME, STRIPE_API_KEY
│   └── tests/
│       ├── test_skills_api.py
│       ├── test_store_compliance.py
│       └── test_subscription_api.py
├── frontend/
│   ├── app/
│   │   ├── (auth)/login.tsx     # + Apple placeholder
│   │   ├── (tabs)/
│   │   │   ├── index.tsx        # + ReportModal
│   │   │   ├── profile.tsx      # + ProfileCompletion + SupporterLink
│   │   │   └── map.tsx
│   │   └── supporter.tsx        # NEW - Pagina sostieni
│   └── src/
│       ├── components/
│       │   ├── ReportModal.tsx
│       │   ├── ProfileCompletionBar.tsx
│       │   ├── SupporterBadge.tsx     # NEW
│       │   ├── Skeleton.tsx
│       │   └── OfflineNotice.tsx
│       └── services/api.ts
└── memory/PRD.md
```

---

## Test Results

| Component | Status | Tests |
|-----------|--------|-------|
| Skills API | ✅ | 12/12 |
| Store Compliance | ✅ | 22/22 |
| Subscription API | ✅ | 12/12 |
| **Total Backend** | **✅ 100%** | **46/46** |

---

## Test Credentials

| Account | Email | Password | Scopo |
|---------|-------|----------|-------|
| Test User | skills_test@test.com | test123 | Testing generale |
| Reviewer | reviewer@test.com | review123 | Debug mode store |

---

## Prossimi Passi

### P1: UI Notifiche
- Icona campanella con badge
- Schermata lista notifiche
- Polling /api/notifications

### P2: Ottimizzazioni
- Performance mappa
- Caching API

---

## Note Deployment

1. **REVIEWER_MODE_ENABLED**: `False` in produzione
2. **STRIPE_API_KEY**: Sostituire con chiave live
3. **Webhook URL**: Configurare in Stripe Dashboard
4. **DB_NAME**: Cambiare da "test_database"
