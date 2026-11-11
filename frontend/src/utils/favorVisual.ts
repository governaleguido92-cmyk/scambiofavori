import { tt, tx } from '../i18n/tt';
import { serverTime } from './serverDate';

export interface CategoryVisual {
  emoji: string;
  /** Colore pieno della banda in cima alla scheda. */
  color: string;
}

const DEFAULT_VISUAL: CategoryVisual = { emoji: '🤝', color: '#98AA4A' };

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'Trasporto': { emoji: '🚗', color: '#E0560F' },
  'Spesa': { emoji: '🛒', color: '#98AA4A' },
  'Tecnologia': { emoji: '💻', color: '#98AA4A' },
  'Pulizie': { emoji: '🧹', color: '#FFFFFF' },
  'Compagnia': { emoji: '🐕', color: '#F87828' },
  'Cucina': { emoji: '🍳', color: '#FB9A52' },
  'Giardinaggio': { emoji: '🌱', color: '#98AA4A' },
  'Consiglio': { emoji: '💡', color: '#98AA4A' },
  'Informazione': { emoji: 'ℹ️', color: '#FB9A52' },
  'Aiuto Rapido': { emoji: '⚡', color: '#98AA4A' },
  'Babysitting': { emoji: '👶', color: '#FB9A52' },
  'Animali': { emoji: '🐾', color: '#BF500E' },
  'Ripetizioni': { emoji: '📚', color: '#6B7A38' },
  'Altro': DEFAULT_VISUAL,
};

export const getCategoryVisual = (category: string): CategoryVisual =>
  CATEGORY_VISUALS[category] ?? DEFAULT_VISUAL;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpiryInfo {
  label: string;
  /** true se scade oggi o è già scaduto: da evidenziare. */
  isSoon: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

/** Testo "scade tra N h" (sotto un giorno) o "scade tra N g", dalla data di scadenza; null se manca o non è valida. */
export const getExpiryInfo = (expiresAt: string | undefined, now: number = Date.now()): ExpiryInfo | null => {
  if (!expiresAt) return null;
  const end = serverTime(expiresAt);
  if (Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0) return { label: tt('scade oggi'), isSoon: true };
  if (left <= DAY_MS) return { label: tx('scade tra {0} h', [Math.ceil(left / HOUR_MS)]), isSoon: true };
  return { label: tx('scade tra {0} g', [Math.ceil(left / DAY_MS)]), isSoon: false };
};

const DISTANCE_STEP_M = 50;
const MIN_SHOWN_M = 50;

// La posizione mostrata è volutamente sfocata (100-300 m), quindi la distanza è solo indicativa: sotto il chilometro
// si arrotonda ai 50 metri, oltre si mostra un decimale fino a 10 km e poi i chilometri interi.
export const formatDistance = (km: number): string => {
  if (km < 1) {
    const meters = Math.max(MIN_SHOWN_M, Math.round((km * 1000) / DISTANCE_STEP_M) * DISTANCE_STEP_M);
    return tx('circa {0} m', [meters]);
  }
  if (km < 10) return tx('circa {0} km', [km.toFixed(1).replace('.', ',')]);
  return tx('circa {0} km', [Math.round(km)]);
};
