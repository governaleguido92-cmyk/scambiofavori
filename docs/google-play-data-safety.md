# Google Play — risposte per "Sicurezza dei dati" e punti collegati

Compilato il 28/10/2026 dal codice dell'app (versione 1.1.0, versionCode 4). Da ricontrollare se l'app cambia
(nuovi SDK, nuovi permessi, nuovi campi). Non è una consulenza legale.

URL norme sulla privacy da inserire: **https://scambiofavori.it/privacy**

## 1. Domande generali

| Domanda in Play Console | Risposta |
|---|---|
| L'app raccoglie o condivide dati utente richiesti? | **Sì** |
| Tutti i dati sono cifrati in transito? | **Sì** (solo HTTPS) |
| Gli utenti possono chiedere la cancellazione dei dati? | **Sì** — dall'app: Profilo → Elimina account. Link web per la richiesta: https://scambiofavori.it/privacy (sezione 8, con l'email di contatto) |
| L'app segue le norme "Famiglie"? | No, destinata a maggiorenni (18+) |

## 2. Tipi di dati da dichiarare

"Condivisi" = trasferiti a terzi che non agiscono come tuoi fornitori. Render, MongoDB Atlas, Cloudflare R2,
Resend, Expo e Stripe trattano i dati **per tuo conto**: Google non li conta come "condivisione".
Verifica comunque la definizione corrente nelle istruzioni della Console.

| Categoria Play | Tipo | Raccolto | Obbligatorio / facoltativo | Finalità | Condiviso |
|---|---|---|---|---|---|
| Informazioni personali | Nome | Sì | Obbligatorio | Funzionalità dell'app, gestione dell'account | No |
| Informazioni personali | Indirizzo email | Sì | Obbligatorio | Funzionalità dell'app, gestione dell'account | No |
| Informazioni personali | ID utente | Sì | Obbligatorio | Funzionalità dell'app, gestione dell'account | No |
| Posizione | Posizione approssimativa | Sì | Facoltativo | Funzionalità dell'app (favori vicini) | No |
| Posizione | Posizione precisa | Sì | Facoltativo | Funzionalità dell'app (favori vicini) | No |
| Foto e video | Foto | Sì | Facoltativo | Funzionalità dell'app (foto profilo) | No |
| Messaggi | Altri messaggi in-app | Sì | Facoltativo | Funzionalità dell'app (chat) | No |
| Attività nell'app | Altri contenuti generati dagli utenti | Sì | Facoltativo | Funzionalità dell'app (favori, recensioni) | No |
| Cronologia acquisti (Info finanziarie) | Cronologia acquisti | Sì | Facoltativo | Funzionalità dell'app (contributo Sostenitore) | No |
| ID dispositivo o altri ID | Device or other IDs | Sì | Facoltativo | Funzionalità dell'app (token notifiche push) | No |

Non raccolti (verificato in `package.json` e nel backend): numero della carta (lo gestisce Stripe), contatti,
calendario, file, microfono, cronologia di navigazione, dati di salute, strumenti di analisi o pubblicità, SDK di
crash reporting. Il server registra l'indirizzo IP nei log di sistema: se la Console lo chiede, dichiaralo sotto
"ID dispositivo o altri ID" con finalità "Sicurezza, prevenzione di frodi e conformità".

## 3. Permessi Android dichiarati (`app.json`)

| Permesso | Uso reale | Nota |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Favori vicini | Solo in primo piano; descrizione nel dialogo di consenso |
| `CAMERA` | Scansione QR e foto profilo | Chiesto solo all'uso |
| `READ_MEDIA_IMAGES` | Scelta foto profilo | **Da rimuovere se possibile**: il selettore di foto di sistema non lo richiede e Google Play limita questo permesso |
| `INTERNET`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED` | Rete, notifiche | Standard |

## 4. Punti che possono bloccare la pubblicazione

1. **Pagamento "Sostenitore" con Stripe (€1).** L'app vende dentro l'app un vantaggio digitale (badge "Cuore Dorato" e
   bordo sul profilo) pagato con Stripe. Le norme sui pagamenti di Google Play richiedono **Google Play Billing** per
   beni e servizi digitali venduti nell'app. Rischio concreto di rifiuto o rimozione. Opzioni: (a) usare Play Billing;
   (b) togliere il vantaggio e presentarlo come donazione, verificando se rientra nelle eccezioni; (c) disattivare il
   Sostenitore nella versione Android. **Decisione da prendere prima dell'invio.**
2. **Accesso per i revisori.** Serve indicare in Console come entrare nell'app: va creato un utente di prova e
   inserite le credenziali nella sezione "Accesso all'app". Le credenziali le inserisci tu.
3. **Contenuti generati dagli utenti.** Le norme richiedono segnalazione e blocco dei contenuti: l'app ha già la
   segnalazione (ReportModal). Descrivi in Console come moderi le segnalazioni.
4. **Test per i nuovi account sviluppatore.** Un account personale creato dopo novembre 2023 deve completare un test
   chiuso con almeno 12 tester per 14 giorni prima della produzione.
5. **Accesso con Google.** Il login passa dal servizio `demobackend.emergentagent.com` (variabile
   `OAUTH_SESSION_URL`), legato alla vecchia piattaforma. Verifica che funzioni e che sia affidabile per la produzione.

## 5. Altre sezioni della Console (indicazioni)

- **Destinatari:** 18 anni e oltre; l'app non è pensata per i bambini.
- **Questionario sui contenuti:** funzioni sociali con contenuti degli utenti e condivisione della posizione approssimativa.
- **Annunci:** l'app non contiene pubblicità.
- **App di notizie, salute, finanza:** no.
