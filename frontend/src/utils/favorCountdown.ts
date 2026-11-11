import { serverTime } from './serverDate';

/** Conto alla rovescia di un annuncio: quanto manca alla scadenza, in giorni, ore, minuti e secondi. */
const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;
/** Sotto quest'ora il conto alla rovescia diventa rosso: l'occasione sta per sparire. */
export const COUNTDOWN_LAST_HOUR_MS = 60 * 60 * SECOND_MS;

const pad = (value: number): string => String(value).padStart(2, '0');

/** Millisecondi rimasti fino a `expiresAt`; null se la data manca o non è valida. */
export const msLeft = (expiresAt: string | undefined | null, now: number): number | null => {
  if (!expiresAt) return null;
  const end = serverTime(expiresAt);
  return Number.isNaN(end) ? null : end - now;
};

/** "02:14:37", oppure "3 g 04:12:09" oltre il giorno. Mai negativo. */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / SECOND_MS));
  const days = Math.floor(total / DAY_S);
  const hours = Math.floor((total % DAY_S) / HOUR_S);
  const minutes = Math.floor((total % HOUR_S) / MINUTE_S);
  const seconds = total % MINUTE_S;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days} g ${clock}` : clock;
};
