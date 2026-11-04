import { api } from '../services/api';

export const VERIFY_PHONE_FROM_REGISTER = '/verify-phone?from=register';
export const HOME_ROUTE = '/(tabs)';

/**
 * Dove andare dopo la registrazione. Un account nuovo non ha il telefono verificato: se il server lo richiede
 * si passa dalla verifica (un ultimo passo, come nelle altre app), altrimenti si entra subito.
 * Se il server non risponde si entra: la verifica sarà comunque chiesta al primo favore.
 */
export async function routeAfterRegistration(): Promise<string> {
  try {
    const config = await api.getAppConfig();
    return config.phone_verification_required ? VERIFY_PHONE_FROM_REGISTER : HOME_ROUTE;
  } catch {
    return HOME_ROUTE;
  }
}
