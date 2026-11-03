import { PhoneRequiredError } from '../services/api';

/** Se il server chiede il telefono verificato, apre la schermata di verifica e restituisce true. */
export const openPhoneVerificationIfNeeded = (error: unknown, router: { push: (href: never) => void }): boolean => {
  if (!(error instanceof PhoneRequiredError)) return false;
  router.push('/verify-phone' as never);
  return true;
};
