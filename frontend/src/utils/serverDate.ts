/**
 * Le date del server sono in UTC ma spesso arrivano senza fuso ("2026-11-12T00:03:41.723"): il database le
 * restituisce così. `new Date()` le leggerebbe come ora locale, un'ora avanti o indietro in Italia.
 * Qui una data senza fuso si legge sempre come UTC.
 */
const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Millisecondi della data del server; NaN se manca o non è valida. */
export const serverTime = (value: string | undefined | null): number => {
  if (!value) return Number.NaN;
  const text = String(value).trim();
  const isDateTime = text.includes('T');
  return new Date(isDateTime && !HAS_TIMEZONE.test(text) ? `${text}Z` : text).getTime();
};

/** La stessa data come oggetto Date, per mostrarla con toLocaleString. */
export const serverDate = (value: string | undefined | null): Date => new Date(serverTime(value));
