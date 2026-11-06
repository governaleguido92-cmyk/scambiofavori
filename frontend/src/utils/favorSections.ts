import type { Favor } from '../services/api';
import { getExpiryInfo } from './favorVisual';

export type FavorFilter = 'all' | 'near' | 'soon';
export type FavorSectionKey = 'urgent' | 'near' | 'skills' | 'others';

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
/** Le urgenze in Home sono poche: il resto sta nella schermata Urgenze. */
export const URGENT_PREVIEW = 3;
/** «Vicini a te» sono i più vicini in assoluto, non quelli entro un raggio fisso: funziona anche con pochi iscritti. */
export const NEAR_COUNT = 5;
/** Da quante richieste uguali si fa una riga sola. */
export const GROUP_MIN = 3;

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

const hasDistance = (favor: Favor): boolean => Number.isFinite(distanceOf(favor));

/**
 * Urgenti, poi i più vicini, poi quelli in linea con le competenze, poi gli altri.
 * Ogni favore sta in una sola fascia; le fasce vuote spariscono.
 */
export const buildSections = (favors: readonly Favor[], skills: readonly string[] = []): FavorSection[] => {
  const sorted = sortFavors(favors);
  const urgent = sorted.filter((favor) => favor.is_emergency);
  const rest = sorted.filter((favor) => !favor.is_emergency);
  const near = rest.filter(hasDistance).slice(0, NEAR_COUNT);
  const nearIds = new Set(near.map((favor) => favor.favor_id));
  const remaining = rest.filter((favor) => !nearIds.has(favor.favor_id));
  const mine = new Set(skills);
  const inSkills = mine.size ? remaining.filter((favor) => mine.has(favor.category)) : [];
  const skillIds = new Set(inSkills.map((favor) => favor.favor_id));
  const others = remaining.filter((favor) => !skillIds.has(favor.favor_id));
  const sections: FavorSection[] = [
    { key: 'urgent', favors: urgent },
    { key: 'near', favors: near },
    { key: 'skills', favors: inSkills },
    { key: 'others', favors: others },
  ];
  return sections.filter((section) => section.favors.length > 0);
};

export type FavorRow =
  | { type: 'header'; key: string; section: FavorSectionKey; total: number; expanded: boolean; canExpand: boolean }
  | { type: 'pair'; key: string; left: Favor; right?: Favor }
  | { type: 'group'; key: string; title: string; category: string; count: number; nearestKm: number | null };

const groupKey = (favor: Favor): string => `${favor.type}|${normalize(favor.title)}`;

type Unit = { kind: 'single'; favor: Favor } | { kind: 'group'; key: string; favors: Favor[] };

/** Più richieste uguali (stesso titolo e tipo) diventano un'unica riga; le urgenze non si raggruppano mai. */
const toUnits = (favors: readonly Favor[], allowGroups: boolean): Unit[] => {
  if (!allowGroups) return favors.map((favor) => ({ kind: 'single', favor }));
  const counts = new Map<string, Favor[]>();
  favors.forEach((favor) => counts.set(groupKey(favor), [...(counts.get(groupKey(favor)) ?? []), favor]));
  const units: Unit[] = [];
  const done = new Set<string>();
  favors.forEach((favor) => {
    const key = groupKey(favor);
    const members = counts.get(key) ?? [];
    if (members.length < GROUP_MIN) {
      units.push({ kind: 'single', favor });
    } else if (!done.has(key)) {
      done.add(key);
      units.push({ kind: 'group', key, favors: members });
    }
  });
  return units;
};

const unitsToRows = (units: readonly Unit[], prefix: string): FavorRow[] => {
  const rows: FavorRow[] = [];
  let buffer: Favor[] = [];
  const flush = () => {
    for (let i = 0; i < buffer.length; i += 2) {
      rows.push({ type: 'pair', key: `${prefix}-${buffer[i].favor_id}`, left: buffer[i], right: buffer[i + 1] });
    }
    buffer = [];
  };
  units.forEach((unit) => {
    if (unit.kind === 'single') {
      buffer.push(unit.favor);
      return;
    }
    flush();
    const distances = unit.favors.map(distanceOf).filter(Number.isFinite);
    rows.push({
      type: 'group', key: `g-${prefix}-${unit.key}`, title: unit.favors[0].title, category: unit.favors[0].category,
      count: unit.favors.length, nearestKm: distances.length ? Math.min(...distances) : null,
    });
  });
  flush();
  return rows;
};

const previewOf = (section: FavorSectionKey): number => (section === 'urgent' ? URGENT_PREVIEW : SECTION_PREVIEW);

/** Righe per l'elenco: se i favori sono pochi (o c'è una ricerca) un elenco unico, altrimenti a fasce. */
export const buildRows = (
  favors: readonly Favor[],
  options: { grouped: boolean; expanded: ReadonlySet<FavorSectionKey>; skills?: readonly string[] },
): FavorRow[] => {
  if (!options.grouped || favors.length < SECTIONS_MIN_FAVORS) {
    return unitsToRows(toUnits(sortFavors(favors), false), 'all');
  }
  return buildSections(favors, options.skills ?? []).flatMap((section) => {
    const expanded = options.expanded.has(section.key);
    const units = toUnits(section.favors, section.key !== 'urgent');
    const preview = previewOf(section.key);
    const canExpand = units.length > preview;
    const shown = expanded ? units : units.slice(0, preview);
    const header: FavorRow = {
      type: 'header', key: `h-${section.key}`, section: section.key,
      total: section.favors.length, expanded, canExpand,
    };
    return [header, ...unitsToRows(shown, section.key)];
  });
};
