/** Raggio di ricerca sulla mappa: da 10 metri a 15 km, con scala logaritmica (più precisione sui valori piccoli). */
export const MIN_RADIUS_KM = 0.01;
export const MAX_RADIUS_KM = 15;
export const DEFAULT_RADIUS_KM = 5;

/** Raggi provati in ordine quando ci sono pochi favori vicini: si parte stretti e si allarga solo se serve. */
export const WIDEN_STEPS_KM: readonly number[] = [5, 10, 15];
/** Sotto questo numero di favori nel raggio, l'elenco si allarga al passo successivo. */
export const MIN_FAVORS_BEFORE_WIDENING = 5;

/** Il raggio più piccolo tra i passi che dà abbastanza favori; se nessuno basta, il più largo. */
export const pickWidenedRadius = (distancesKm: readonly number[]): number => {
  for (const step of WIDEN_STEPS_KM) {
    if (distancesKm.filter((km) => km <= step).length >= MIN_FAVORS_BEFORE_WIDENING) return step;
  }
  return WIDEN_STEPS_KM[WIDEN_STEPS_KM.length - 1];
};

const LOG_RATIO = Math.log(MAX_RADIUS_KM / MIN_RADIUS_KM);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Passo di arrotondamento in km: 10 m sotto i 100 m, 50 m sotto 1 km, 100 m sotto 5 km, poi 500 m. */
const stepFor = (km: number): number => {
  if (km < 0.1) return 0.01;
  if (km < 1) return 0.05;
  if (km < 5) return 0.1;
  return 0.5;
};

/** Arrotonda a un valore "comodo" e lo tiene dentro i limiti. */
export const snapRadiusKm = (km: number): number => {
  const bounded = clamp(km, MIN_RADIUS_KM, MAX_RADIUS_KM);
  const step = stepFor(bounded);
  const snapped = Math.round(bounded / step) * step;
  // toFixed evita errori tipo 0.30000000000000004
  return clamp(Number(snapped.toFixed(2)), MIN_RADIUS_KM, MAX_RADIUS_KM);
};

/** Posizione del cursore (0..1) -> km. */
export const radiusFromPosition = (position: number): number =>
  snapRadiusKm(MIN_RADIUS_KM * Math.exp(LOG_RATIO * clamp(position, 0, 1)));

/** km -> posizione del cursore (0..1). */
export const positionFromRadius = (km: number): number =>
  clamp(Math.log(clamp(km, MIN_RADIUS_KM, MAX_RADIUS_KM) / MIN_RADIUS_KM) / LOG_RATIO, 0, 1);

/** "10 m", "250 m", "1,5 km", "15 km". */
export const formatRadius = (km: number): string => {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
};

/** Tiene solo i favori con distanza nota entro il raggio scelto. */
export const withinRadius = <T extends { distance_km?: number }>(items: T[], radiusKm: number): T[] =>
  items.filter((item) => typeof item.distance_km === 'number' && item.distance_km <= radiusKm);
