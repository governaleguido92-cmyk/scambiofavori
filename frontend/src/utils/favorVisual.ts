import { tt, tx } from '../i18n/tt';

export interface CategoryVisual {
  emoji: string;
  /** Colore pieno della banda in cima alla scheda. */
  color: string;
}

const DEFAULT_VISUAL: CategoryVisual = { emoji: '🤝', color: '#3D7A52' };

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'Trasporto': { emoji: '🚗', color: '#B8503F' },
  'Spesa': { emoji: '🛒', color: '#2F8F5B' },
  'Tecnologia': { emoji: '💻', color: '#2C7FB8' },
  'Pulizie': { emoji: '🧹', color: '#8A5FC0' },
  'Compagnia': { emoji: '🐕', color: '#C47A1E' },
  'Cucina': { emoji: '🍳', color: '#C25A7A' },
  'Giardinaggio': { emoji: '🌱', color: '#6F8F26' },
  'Consiglio': { emoji: '💡', color: '#2A9AA0' },
  'Informazione': { emoji: 'ℹ️', color: '#4F6FB0' },
  'Aiuto Rapido': { emoji: '⚡', color: '#C9A227' },
  'Babysitting': { emoji: '👶', color: '#D9777F' },
  'Animali': { emoji: '🐾', color: '#A0693C' },
  'Ripetizioni': { emoji: '📚', color: '#4F7DC0' },
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

/** Testo "scade tra N g" calcolato dalla data di scadenza; null se manca o non è valida. */
export const getExpiryInfo = (expiresAt: string | undefined, now: number = Date.now()): ExpiryInfo | null => {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  const days = Math.ceil((end - now) / DAY_MS);
  if (days <= 0) return { label: tt('scade oggi'), isSoon: true };
  return { label: tx('scade tra {0} g', [days]), isSoon: days <= 1 };
};

// La posizione mostrata è volutamente sfocata, quindi la distanza è arrotondata per eccesso.
export const formatDistance = (km: number): string =>
  km < 1 ? tt('meno di 1 km') : tx('circa {0} km', [Math.ceil(km)]);
