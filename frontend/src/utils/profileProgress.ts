import type { Badge, BadgeRequirement } from '../services/api';

const COMMUNITY_LEVEL_POINTS = 100;
const SOCIAL_IMPACT_LEVEL_POINTS = 100;
const SOCIAL_IMPACT_MAX_POINTS = 500;

export interface CommunityProgress {
  level: number;
  /** Punti guadagnati nel livello attuale (0-99). */
  progress: number;
  /** Punti che mancano al prossimo livello. */
  remaining: number;
}

/** Livello della "Crescita Comunitaria": un livello ogni 100 punti, si parte dal livello 1. */
export const communityProgress = (score: number): CommunityProgress => {
  const safe = Math.max(0, Math.floor(score || 0));
  const progress = safe % COMMUNITY_LEVEL_POINTS;
  return { level: Math.floor(safe / COMMUNITY_LEVEL_POINTS) + 1, progress, remaining: COMMUNITY_LEVEL_POINTS - progress };
};

export interface SocialImpact {
  level: number;
  /** Percentuale della barra (0-100), piena a 500 punti. */
  percent: number;
}

export const socialImpact = (score: number): SocialImpact => {
  const safe = Math.max(0, score || 0);
  return {
    level: Math.floor(safe / SOCIAL_IMPACT_LEVEL_POINTS),
    percent: Math.min((safe / SOCIAL_IMPACT_MAX_POINTS) * 100, 100),
  };
};

/** true se c'è almeno una valutazione: altrimenti le stelle vuote non dicono niente. */
export const hasRatings = (user: { average_rating?: number; average_kindness?: number; average_impact?: number } | null | undefined): boolean =>
  Boolean(user && ((user.average_rating ?? 0) > 0 || (user.average_kindness ?? 0) > 0 || (user.average_impact ?? 0) > 0));

export interface ShelfBadge extends Badge {
  earned: boolean;
}

/** Tutti i badge con lo stato "ottenuto", quelli ottenuti per primi; a parità si mantiene l'ordine del server. */
export const sortBadges = (all: Badge[], earned: Badge[]): ShelfBadge[] => {
  const earnedIds = new Set(earned.map((badge) => badge.id));
  const marked = all.map((badge) => ({ ...badge, earned: earnedIds.has(badge.id) }));
  return [...marked.filter((badge) => badge.earned), ...marked.filter((badge) => !badge.earned)];
};

export interface RequirementText {
  /** Testo in italiano (sorgente delle traduzioni), con {0} al posto del numero. */
  text: string;
  value: number;
}

const REQUIREMENT_TEXTS: Record<string, string> = {
  donations: 'Dona almeno {0} Granelli al Fondo Solidarietà.',
  favors_completed: 'Completa {0} favori.',
  perfect_reviews: 'Ricevi il massimo dei voti da {0} persone diverse.',
  referrals: 'Invita {0} persone che completano il loro primo favore.',
  micro_favors: 'Dai una mano in {0} favori brevi (fino a un\'ora).',
  favors_given: 'Aiuta gli altri in {0} favori.',
  distinct_neighbors: 'Aiuta {0} persone diverse.',
  punctual: 'Aiuta {0} volte e non annullare quasi mai dopo aver accettato.',
  vouches: 'Garantisci per {0} vicini, senza che nessuno venga messo in revisione.',
  events_with_guests: 'Organizza {0} eventi o ritrovi del quartiere a cui partecipa qualcuno.',
  welcomes_given: 'Dai il benvenuto a {0} nuovi vicini.',
  profile_complete: 'Completa il tuo profilo.',
  first_favor: 'Completa il tuo primo favore.',
  emergencies_helped: 'Rispondi a {0} Emergenze Gentilezza.',
  high_rating: 'Mantieni una valutazione media sopra {0} stelle, con almeno 10 recensioni.',
};

const FALLBACK_REQUIREMENT = 'Partecipa attivamente alla community.';

/** "Come ottenerlo", ricavato dal requisito che il server manda con ogni badge. */
export const describeRequirement = (requirement: BadgeRequirement | undefined): RequirementText => {
  const text = requirement ? REQUIREMENT_TEXTS[requirement.type] : undefined;
  return { text: text ?? FALLBACK_REQUIREMENT, value: requirement?.value ?? 0 };
};

/** Valore medio delle recensioni (1-5) con una cifra decimale, o null senza recensioni. */
export const averageReviewRating = (reviews: ReadonlyArray<{ rating: number }>): number | null => {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
};

export const DONATION_QUICK_AMOUNTS: readonly number[] = [1, 3, 5];

/** L'importo scritto, in un numero intero valido tra 1 e i Granelli che hai; null se non c'è niente da donare. */
export const clampDonation = (text: string, balance: number): number | null => {
  const max = Math.floor(balance);
  if (max < 1) return null;
  const parsed = parseInt(text, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.min(max, Math.max(1, parsed));
};
