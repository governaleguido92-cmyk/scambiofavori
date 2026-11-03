export interface PhonePrefix {
  code: string;
  flag: string;
  name: string;
  dial: string;
}

export const DEFAULT_PHONE_PREFIX: PhonePrefix = { code: 'IT', flag: '🇮🇹', name: 'Italia', dial: '+39' };

export const PHONE_PREFIXES: readonly PhonePrefix[] = [
  DEFAULT_PHONE_PREFIX,
  { code: 'SM', flag: '🇸🇲', name: 'San Marino', dial: '+378' },
  { code: 'VA', flag: '🇻🇦', name: 'Città del Vaticano', dial: '+379' },
  { code: 'CH', flag: '🇨🇭', name: 'Svizzera', dial: '+41' },
  { code: 'DE', flag: '🇩🇪', name: 'Germania', dial: '+49' },
  { code: 'FR', flag: '🇫🇷', name: 'Francia', dial: '+33' },
  { code: 'ES', flag: '🇪🇸', name: 'Spagna', dial: '+34' },
  { code: 'PT', flag: '🇵🇹', name: 'Portogallo', dial: '+351' },
  { code: 'GB', flag: '🇬🇧', name: 'Regno Unito', dial: '+44' },
  { code: 'IE', flag: '🇮🇪', name: 'Irlanda', dial: '+353' },
  { code: 'NL', flag: '🇳🇱', name: 'Paesi Bassi', dial: '+31' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgio', dial: '+32' },
  { code: 'LU', flag: '🇱🇺', name: 'Lussemburgo', dial: '+352' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria', dial: '+43' },
  { code: 'GR', flag: '🇬🇷', name: 'Grecia', dial: '+30' },
  { code: 'MT', flag: '🇲🇹', name: 'Malta', dial: '+356' },
  { code: 'SE', flag: '🇸🇪', name: 'Svezia', dial: '+46' },
  { code: 'NO', flag: '🇳🇴', name: 'Norvegia', dial: '+47' },
  { code: 'DK', flag: '🇩🇰', name: 'Danimarca', dial: '+45' },
  { code: 'FI', flag: '🇫🇮', name: 'Finlandia', dial: '+358' },
  { code: 'PL', flag: '🇵🇱', name: 'Polonia', dial: '+48' },
  { code: 'RO', flag: '🇷🇴', name: 'Romania', dial: '+40' },
  { code: 'AL', flag: '🇦🇱', name: 'Albania', dial: '+355' },
  { code: 'HR', flag: '🇭🇷', name: 'Croazia', dial: '+385' },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenia', dial: '+386' },
  { code: 'UA', flag: '🇺🇦', name: 'Ucraina', dial: '+380' },
  { code: 'US', flag: '🇺🇸', name: 'Stati Uniti / Canada', dial: '+1' },
  { code: 'BR', flag: '🇧🇷', name: 'Brasile', dial: '+55' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina', dial: '+54' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', dial: '+61' },
];

/** Numero internazionale dal prefisso scelto e dal numero digitato (senza zeri iniziali). */
export function buildPhoneNumber(prefix: PhonePrefix, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return `${prefix.dial}${digits}`;
}
