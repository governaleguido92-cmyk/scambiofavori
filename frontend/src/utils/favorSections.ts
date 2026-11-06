import type { Favor } from '../services/api';
import { getExpiryInfo } from './favorVisual';

export type FavorFilter = 'all' | 'near' | 'soon';
export type FavorSectionKey = 'urgent' | 'near' | 'others';

export interface FavorSection {
  key: FavorSectionKey;
  favors: Favor[];
}

/** Entro questa distanza un favore è «vicino a te». */
export const NEAR_KM = 1;
/** Sotto questo numero di favori l'elenco resta unico: le fasce servono solo quando sono molti. */
export const SECTIONS_MIN_FAVORS = 7;
/** Quanti favori mostra ogni fascia prima di «Vedi tutti». */
export const SECTION_PREVIEW = 4;

const distanceOf = (favor: Favor): number =>
  typeof favor.distance_km === 'number' ? favor.distance_km : Number.POSITIVE_INFINITY;

const expiryOf = (favor: Favor): number => {
  const end = favor.expires_at ? new Date(favor.expires_at).getTime() : NaN;
  return Number.isNaN(end) ? Number.POSITIVE_INFINITY : end;
};

const isSoon = (favor: Favor, now: number): boolean => !!getExpiryInfo(favor.expires_at, now)?.isSoon;

/** Prima i più vicini, a parità quelli che scadono prima. Non modifica l'elenco ricevuto. */
export const sortFavors = (favors: readonly Favor[]): Favor[] =>
  [...favors].sort((a, b) => distanceOf(a) - distanceOf(b) || expiryOf(a) - expiryOf(b));

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Parole cercate in titolo, descrizione e categoria, senza badare ad accenti e maiuscole. */
export const matchesQuery = (favor: Favor, query: string): boolean => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${favor.title} ${favor.description ?? ''} ${favor.category ?? ''}`);
  return words.every((word) => haystack.includes(word));
};

export const filterFavors = (
  favors: readonly Favor[],
  filter: FavorFilter,
  query: string,
  now: number = Date.now(),
): Favor[] =>
  favors.filter((favor) => {
    if (!matchesQuery(favor, query)) return false;
    if (filter === 'near') return distanceOf(favor) <= NEAR_KM;
    if (filter === 'soon') return isSoon(favor, now);
    return true;
  });

/** Urgenti, poi vicini a te, poi gli altri. Ogni favore sta in una sola fascia; le fasce vuote spariscono. */
export const buildSections = (favors: readonly Favor[]): FavorSection[] => {
  const sorted = sortFavors(favors);
  const urgent = sorted.filter((favor) => favor.is_emergency);
  const rest = sorted.filter((favor) => !favor.is_emergency);
  const near = rest.filter((favor) => distanceOf(favor) <= NEAR_KM);
  const others = rest.filter((favor) => distanceOf(favor) > NEAR_KM);
  const sections: FavorSection[] = [
    { key: 'urgent', favors: urgent },
    { key: 'near', favors: near },
    { key: 'others', favors: others },
  ];
  return sections.filter((section) => section.favors.length > 0);
};

export type FavorRow =
  | { type: 'header'; key: string; section: FavorSectionKey; total: number; expanded: boolean; canExpand: boolean }
  | { type: 'pair'; key: string; left: Favor; right?: Favor };

const toPairs = (favors: readonly Favor[], prefix: string): FavorRow[] => {
  const rows: FavorRow[] = [];
  for (let i = 0; i < favors.length; i += 2) {
    rows.push({ type: 'pair', key: `${prefix}-${favors[i].favor_id}`, left: favors[i], right: favors[i + 1] });
  }
  return rows;
};

/** Righe per l'elenco a due colonne: se i favori sono pochi (o c'è una ricerca) un elenco unico, altrimenti a fasce. */
export const buildRows = (
  favors: readonly Favor[],
  options: { grouped: boolean; expanded: ReadonlySet<FavorSectionKey> },
): FavorRow[] => {
  if (!options.grouped || favors.length < SECTIONS_MIN_FAVORS) {
    return toPairs(sortFavors(favors), 'all');
  }
  return buildSections(favors).flatMap((section) => {
    const expanded = options.expanded.has(section.key);
    const canExpand = section.favors.length > SECTION_PREVIEW;
    const shown = expanded ? section.favors : section.favors.slice(0, SECTION_PREVIEW);
    const header: FavorRow = {
      type: 'header', key: `h-${section.key}`, section: section.key,
      total: section.favors.length, expanded, canExpand,
    };
    return [header, ...toPairs(shown, section.key)];
  });
};
