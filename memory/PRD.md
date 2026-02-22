# Scambio di Favori - Product Requirements Document

## Overview
"Scambio di Favori" è una piattaforma community iperlocale per lo scambio di favori tra vicini, con un sistema di valuta interna chiamato "Granelli" (💎).

## Store Compliance Status: READY ✅
## Monetization: SUPPORTER SYSTEM ACTIVE ✅
## UI Integration: COMPLETE ✅
## UX Flow: OPTIMIZED ✅

---

## COMPLETATO: Integrazione UI Sostenitori (Dicembre 2024)

### Componenti Integrati
- **SupporterBadge nelle Favor Cards**: Badge cuore dorato visibile nelle card dei favori per utenti sostenitori
- **SupporterProfileBorder nel Profilo**: Bordo dorato attorno all'avatar per sostenitori
- **SupporterBadge nel Nome Profilo**: Badge "Sostenitore" accanto al nome utente
- **OfflineNotice Globale**: Banner di connessione persa nel root layout
- **Skeleton Loading**: Placeholder animati durante il caricamento della lista favori
- **NetworkErrorBanner**: Banner errore rete con pulsante "Riprova"
- **Banner Promozionale Sostenitori**: Banner nella home per utenti non-sostenitori con CTA per diventare sostenitori

### UX Flow Migliorati
- **Chat Automatica dopo Accettazione**: Quando un utente accetta un favore, viene automaticamente reindirizzato alla chat per coordinare i dettagli

### Funzionalità Reviewer (Debug Mode)
- **Mock QR Scan Button**: Pulsante visibile solo per `reviewer@test.com` nella pagina del favore
- **API /api/debug/is-reviewer**: Verifica stato reviewer
- **API /api/debug/mock-qr-scan**: Simula completamento QR per testing

---

## Sistema Sostenitori "Pilastro della Community"

### Panoramica
Sistema di micro-sostegno ricorrente per coprire i costi dell'app e premiare i sostenitori.

### Pricing
- **Piano Unico**: 1€/mese (cancellabile in qualsiasi momento)

### Benefici Sostenitori
- **Badge Cuore Dorato**: Icona ❤️ dorata accanto al nome ovunque nell'app ✅
- **Bordo Profilo Dorato**: Foto profilo con cornice dorata distintiva ✅
- **Visibilità Mappa**: Profilo evidenziato sulla mappa
- **Badge "Sostenitore"**: Badge permanente nel profilo ✅

### Implementazione Tecnica

#### Backend Endpoints
```
POST /api/subscription/create-checkout   → Crea sessione Stripe Checkout
GET  /api/subscription/my-status         → Stato abbonamento utente
GET  /api/subscription/status/{session}  → Verifica pagamento
GET  /api/subscription/manage-url        → URL Customer Portal Stripe
POST /api/webhook/stripe                 → Webhook eventi Stripe
```

#### Campi Modello User
```json
{
  "is_supporter": "bool",
  "subscription_status": "active|cancelled|null",
  "subscription_id": "string",
  "supporter_since": "datetime"
}
```

#### Campi Modello Favor
```json
{
  "creator_is_supporter": "bool"  // Per visualizzare badge nelle card
}
```

#### Frontend Components
- **SupporterBadge.tsx**: Badge cuore dorato (small/medium/large)
- **SupporterProfileBorder**: Wrapper bordo dorato per avatar
- **UserNameWithBadge**: Nome utente + badge inline

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
- **Reviewer Mode**: Mock QR/GPS per tester Apple/Google ✅

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
- GET /api/favors (include creator_is_supporter) ✅
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

### Subscription
- POST /api/subscription/create-checkout
- GET /api/subscription/my-status
- GET /api/subscription/status/{session_id}
- GET /api/subscription/manage-url
- POST /api/webhook/stripe

### Debug/Reviewer ✅
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
│       ├── test_subscription_api.py
│       └── test_debug_reviewer_api.py  # NEW
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx         # + OfflineNotice globale
│   │   ├── (auth)/login.tsx    # + Apple placeholder
│   │   ├── (tabs)/
│   │   │   ├── index.tsx       # + SupporterBadge, Skeleton, NetworkError
│   │   │   ├── profile.tsx     # + SupporterProfileBorder, SupporterBadge
│   │   │   └── map.tsx
│   │   ├── favor/[id].tsx      # + Mock QR Button per reviewer
│   │   └── supporter.tsx       # Pagina sostieni
│   └── src/
│       ├── components/
│       │   ├── ReportModal.tsx
│       │   ├── ProfileCompletionBar.tsx
│       │   ├── SupporterBadge.tsx      # Badge + ProfileBorder + NameWithBadge
│       │   ├── Skeleton.tsx
│       │   └── OfflineNotice.tsx
│       └── services/api.ts             # + checkReviewerStatus, mockQRScan
└── memory/PRD.md
```

---

## Test Results

| Component | Status | Tests |
|-----------|--------|-------|
| Skills API | ✅ | 12/12 |
| Store Compliance | ✅ | 22/22 |
| Subscription API | ✅ | 12/12 |
| Debug/Reviewer API | ✅ | 13/13 |
| **Total Backend** | **✅ 100%** | **59/59** |

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
- Integrazione SupporterBadge nella mappa

---

## Note Deployment

1. **REVIEWER_MODE_ENABLED**: `False` in produzione
2. **STRIPE_API_KEY**: Sostituire con chiave live
3. **Webhook URL**: Configurare in Stripe Dashboard
4. **DB_NAME**: Cambiare da "test_database"
