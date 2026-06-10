export default {
  // Common
  common: {
    save: 'Salva',
    cancel: 'Annulla',
    confirm: 'Conferma',
    delete: 'Elimina',
    edit: 'Modifica',
    close: 'Chiudi',
    retry: 'Riprova',
    loading: 'Caricamento...',
    error: 'Errore',
    success: 'Successo',
    yes: 'Sì',
    no: 'No',
    ok: 'Ok',
    back: 'Indietro',
    send: 'Invia',
    search: 'Cerca',
    filter: 'Filtra',
    all: 'Tutti',
    online: 'Online',
    offline: 'Sei offline',
    offlineMsg: 'Connettiti a internet per continuare.',
    noData: 'Nessun dato disponibile',
  },

  // Auth
  auth: {
    login: 'Accedi',
    register: 'Registrati',
    logout: 'Esci',
    email: 'Email',
    password: 'Password',
    name: 'Nome',
    forgotPassword: 'Password dimenticata?',
    loginTitle: 'Bentornato!',
    registerTitle: 'Crea un account',
    loginSubtitle: 'Accedi per continuare',
    noAccount: 'Non hai un account?',
    haveAccount: 'Hai già un account?',
    loginError: 'Credenziali errate',
    registerError: 'Impossibile registrarsi',
  },

  // Tabs
  tabs: {
    home: 'Home',
    map: 'Mappa',
    create: 'Crea',
    myFavors: 'I Miei',
    profile: 'Profilo',
  },

  // Home
  home: {
    title: 'ScambioFavori',
    subtitle: 'La tua community',
    activeFavors: 'Favori attivi',
    recentFavors: 'Favori recenti',
    noFavors: 'Nessun favore disponibile',
    offers: 'Offerte',
    requests: 'Richieste',
    allTypes: 'Tutti',
    refresh: 'Aggiorna',
    networkError: 'Errore di rete',
    favorCreated: 'Favore pubblicato!',
    seeAll: 'Vedi tutti',
  },

  // Favor
  favor: {
    offer: 'Offerta',
    request: 'Richiesta',
    accept: 'Accetta',
    complete: 'Completa',
    cancel: 'Annulla',
    status: {
      active: 'Attivo',
      accepted: 'Accettato',
      completed: 'Completato',
      cancelled: 'Annullato',
    },
    confirmAccept: 'Accettando questa offerta, pagherai {{cost}} {{currency}} al completamento.',
    confirmAcceptRequest: 'Accettando questa richiesta, riceverai {{cost}} {{currency}} al completamento.',
    confirmComplete: 'I {{currency}} verranno trasferiti. Sei sicuro?',
    acceptSuccess: 'Favore accettato!',
    completeSuccess: 'Favore completato! I {{currency}} sono stati trasferiti.',
    errorAccept: 'Impossibile accettare il favore',
    errorComplete: 'Impossibile completare il favore',
    noFavors: 'Nessun favore trovato',
    distance: '{{km}} km da te',
    duration: '{{hours}} ore',
    granelliCost: '{{cost}} Granelli',
  },

  // Create
  create: {
    title: 'Crea un Favore',
    offerTitle: 'Cosa offri?',
    requestTitle: 'Di cosa hai bisogno?',
    titleLabel: 'Titolo',
    descriptionLabel: 'Descrizione',
    categoryLabel: 'Categoria',
    durationLabel: 'Durata (ore)',
    locationLabel: 'Posizione',
    publishBtn: 'Pubblica',
    publishing: 'Pubblicazione...',
    errorTitle: 'Inserisci un titolo',
    errorDescription: 'Inserisci una descrizione',
    errorCategory: 'Seleziona una categoria',
    errorLocation: 'Devi indicare la tua posizione',
    offlineError: 'Connettiti a internet per pubblicare un favore.',
    granelliInsufficient: 'Granelli insufficienti',
  },

  // Chat
  chat: {
    title: 'Chat',
    placeholder: 'Scrivi un messaggio...',
    sendLocation: 'Posizione',
    locationSent: 'Posizione Inviata',
    locationSentMsg: "La tua posizione è stata condivisa con l'altro utente.",
    readOnly: 'Chat chiusa',
    blocked: 'Messaggio Bloccato',
    errorSend: 'Errore invio messaggio',
    errorLocation: 'Impossibile inviare la posizione',
    permissionDenied: 'Permesso Negato',
    locationPermissionMsg: 'È necessario il permesso per condividere la posizione.',
  },

  // Profile
  profile: {
    title: 'Profilo',
    editName: 'Modifica nome',
    nameSaved: 'Nome aggiornato!',
    nameError: 'Impossibile aggiornare il nome',
    photoSaved: 'Foto profilo aggiornata!',
    photoError: 'Impossibile caricare la foto. Riprova.',
    skillsSaved: 'Competenze aggiornate! Riceverai notifiche per favori in queste categorie.',
    skillsError: 'Impossibile salvare le competenze',
    cameraPermission: 'Permesso fotocamera necessario',
    libraryPermission: 'È necessario il permesso per accedere alla libreria foto.',
    level: 'Lv.{{level}}',
    title_label: 'Titolo',
    communityGrowth: 'Crescita Comunitaria',
    socialImpact: 'Impatto Sociale',
    logout: 'Esci',
    logoutConfirm: 'Sei sicuro di voler uscire?',
    completion: {
      title: 'Completa il tuo profilo',
      subtitle: '{{done}}/4 completati • {{pct}}%',
      name: 'Nome profilo',
      photo: 'Foto profilo',
      skills: 'Competenze (min. 3)',
      firstFavor: 'Primo favore',
      badge100: 'Completa al 100% per il badge "Profilo Completo"!',
    },
  },

  // Map
  map: {
    title: 'Mappa Favori',
    noFavors: 'Nessun favore nella zona',
    locationError: 'Posizione non disponibile',
    offers: 'Offerte',
    requests: 'Richieste',
  },

  // Notifications
  notifications: {
    title: 'Notifiche',
    empty: 'Nessuna notifica',
    markRead: 'Segna come letta',
  },

  // Settings / Language
  settings: {
    language: 'Lingua',
    selectLanguage: 'Seleziona lingua',
    italian: 'Italiano',
    english: 'English',
  },
};
