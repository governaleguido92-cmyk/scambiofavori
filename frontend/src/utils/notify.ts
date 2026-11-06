import { Alert, Linking } from 'react-native';

export interface ToastMessage {
  id: number;
  title: string;
  message?: string;
}

type ToastListener = (toast: ToastMessage) => void;

let listener: ToastListener | null = null;
let nextId = 1;

/** Called by <ToastHost /> when it mounts; returns the unsubscribe function. */
export function registerToastListener(next: ToastListener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/**
 * Non-blocking replacement for `Alert.alert(title, message)`.
 * Falls back to a native alert if no host is mounted yet (e.g. very early errors).
 */
export function notify(title: string, message?: string): void {
  if (listener) {
    listener({ id: nextId++, title, message });
    return;
  }
  Alert.alert(title, message);
}

/**
 * Messaggio che resta sullo schermo finché non lo chiudi: per i rifiuti che spiegano una regola
 * (limiti dei nuovi utenti, due favori a settimana con la stessa persona, utente bloccato...).
 * L'avviso breve in alto sparisce in pochi secondi e si perde facilmente.
 */
export function showRefusal(title: string, message: string, okLabel: string): void {
  // Se il messaggio indica l'indirizzo del supporto (account in revisione) si offre di scrivere subito
  const support = message.match(/[\w.-]+@scambiofavori\.it/);
  const buttons = [{ text: okLabel }];
  if (support) {
    buttons.unshift({ text: 'Scrivi al supporto', onPress: () => { void Linking.openURL(`mailto:${support[0]}`); } } as any);
  }
  Alert.alert(title, message, buttons);
}
