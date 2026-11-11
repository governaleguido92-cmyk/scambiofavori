import { tt } from '../i18n/tt';

/**
 * Scadenza dell'annuncio: da 1 ora a 5 giorni.
 * Il contatore va di ora in ora fino a 12, poi 18 e 24 ore, poi di giorno in giorno fino a 5.
 */
export const HOURS_PER_DAY = 24;
export const VALIDITY_STEPS_HOURS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 48, 72, 96, 120];
export const DEFAULT_VALIDITY_HOURS = 72;
export const MIN_VALIDITY_HOURS = VALIDITY_STEPS_HOURS[0];
export const MAX_VALIDITY_HOURS = VALIDITY_STEPS_HOURS[VALIDITY_STEPS_HOURS.length - 1];

/** Porta un valore qualsiasi (es. un favore vecchio) al passo del contatore più vicino. */
export const nearestValidityStep = (hours: number): number => {
  if (!Number.isFinite(hours)) return DEFAULT_VALIDITY_HOURS;
  return VALIDITY_STEPS_HOURS.reduce((best, step) => (Math.abs(step - hours) < Math.abs(best - hours) ? step : best));
};

/** Passo successivo (+1) o precedente (-1) del contatore, fermandosi agli estremi. */
export const stepValidity = (hours: number, direction: 1 | -1): number => {
  const index = VALIDITY_STEPS_HOURS.indexOf(nearestValidityStep(hours));
  const next = Math.min(VALIDITY_STEPS_HOURS.length - 1, Math.max(0, index + direction));
  return VALIDITY_STEPS_HOURS[next];
};

/** "1 ora", "6 ore", "1 giorno", "3 giorni". */
export const formatValidity = (hours: number): string => {
  if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) {
    const days = hours / HOURS_PER_DAY;
    return `${days} ${days === 1 ? tt('giorno') : tt('giorni')}`;
  }
  return `${hours} ${hours === 1 ? tt('ora') : tt('ore')}`;
};

/** Ore di vita di un favore già pubblicato: i favori vecchi hanno solo i giorni. */
export const validityHoursOf = (favor: { validity_hours?: number | null; validity_days?: number | null }): number =>
  favor.validity_hours ?? (favor.validity_days ?? DEFAULT_VALIDITY_HOURS / HOURS_PER_DAY) * HOURS_PER_DAY;

/** Giorni da mandare insieme alle ore, per un server non ancora aggiornato. */
export const validityDaysFor = (hours: number): number => Math.max(1, Math.ceil(hours / HOURS_PER_DAY));
