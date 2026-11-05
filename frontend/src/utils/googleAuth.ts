import { Platform } from 'react-native';

/** ID client OAuth "Web" creato su Google Cloud Console (è pubblico, non è un segreto). */
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

/**
 * Pagina del sito che rimanda all'app: Google accetta solo indirizzi https registrati, quindi sul telefono
 * il ritorno passa di qui e poi riapre l'app con l'ID token.
 */
export const GOOGLE_NATIVE_CALLBACK = 'https://scambiofavori.it/google-callback.html';

const NONCE_KEY = 'google_login_nonce';
let memoryNonce: string | null = null;

export function isGoogleLoginConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/** Il nonce lo genera il server (firmato, monouso): l'app lo ricorda finché Google non rimanda indietro il token. */
export function rememberNonce(nonce: string): void {
  memoryNonce = nonce;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(NONCE_KEY, nonce);
    } catch {
      /* sessionStorage non disponibile: resta quello in memoria */
    }
  }
}

export function recallNonce(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return window.sessionStorage.getItem(NONCE_KEY) || memoryNonce;
    } catch {
      return memoryNonce;
    }
  }
  return memoryNonce;
}

export function forgetNonce(): void {
  memoryNonce = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(NONCE_KEY);
    } catch {
      /* niente da fare */
    }
  }
}

export function buildGoogleAuthUrl(redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Legge #id_token=... dall'indirizzo di ritorno (o da un frammento). */
export function readIdTokenFromUrl(url: string): string | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  return new URLSearchParams(url.substring(hashIndex + 1)).get('id_token');
}
