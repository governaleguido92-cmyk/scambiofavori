export interface PlaceCategoryChip {
  /** Chiave accettata dal server (vedi backend/places.py). */
  key: string;
  /** Testo in italiano (sorgente delle traduzioni). */
  label: string;
  emoji: string;
}

export const PLACE_CATEGORIES: readonly PlaceCategoryChip[] = [
  { key: 'bar', label: 'Bar', emoji: '☕' },
  { key: 'square', label: 'Piazza', emoji: '🏛️' },
  { key: 'pharmacy', label: 'Farmacia', emoji: '💊' },
  { key: 'park', label: 'Parco', emoji: '🌳' },
  { key: 'church', label: 'Chiesa', emoji: '⛪' },
  { key: 'supermarket', label: 'Supermercato', emoji: '🛒' },
  { key: 'station', label: 'Stazione', emoji: '🚉' },
];

export const emojiForCategory = (key: string): string =>
  PLACE_CATEGORIES.find((category) => category.key === key)?.emoji ?? '📍';

/** Distanza leggibile: "circa 300 m" sotto il chilometro, "circa 1,2 km" sopra. Le posizioni sono approssimate. */
export const formatPlaceDistance = (meters: number, locale: string = 'it-IT'): string => {
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) return `${rounded} m`;
  return `${(rounded / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
};

/** Il testo da mettere nel campo "Dove": nome e, se c'è, la via. */
export const placeLabel = (place: { name: string; street?: string | null }): string =>
  place.street ? `${place.name}, ${place.street}` : place.name;
