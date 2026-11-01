/**
 * Messaggio "punto d'incontro": luogo e orario su due righe, riconosciute dall'app e mostrate come scheda.
 *
 *   📍 Bar Roma, davanti alla farmacia
 *   🕒 Oggi alle 18
 *
 * Le icone fanno da marcatore, così il formato non dipende dalla lingua. Chi ha una versione vecchia
 * dell'app vede le due righe di testo normale.
 */
export const PLACE_MARK = '📍 ';
export const TIME_MARK = '🕒 ';
export const PLACE_MAX = 80;
export const WHEN_MAX = 40;

export interface MeetingPoint {
  place: string;
  when?: string;
}

const clean = (value: string, max: number): string => value.replace(/\s+/g, ' ').trim().slice(0, max);

/** Il testo da inviare, oppure null se manca il luogo. */
export const formatMeetingPointMessage = (place: string, when?: string): string | null => {
  const cleanPlace = clean(place, PLACE_MAX);
  if (!cleanPlace) return null;
  const cleanWhen = clean(when ?? '', WHEN_MAX);
  return cleanWhen ? `${PLACE_MARK}${cleanPlace}\n${TIME_MARK}${cleanWhen}` : `${PLACE_MARK}${cleanPlace}`;
};

/** Riconosce un messaggio di punto d'incontro. Le posizioni con link alle mappe non lo sono. */
export const parseMeetingPointMessage = (content: string): MeetingPoint | null => {
  if (!content.startsWith(PLACE_MARK) || content.includes('maps.google.com')) return null;
  const [placeLine, timeLine] = content.split('\n');
  const place = placeLine.slice(PLACE_MARK.length).trim();
  if (!place) return null;
  const when = timeLine?.startsWith(TIME_MARK) ? timeLine.slice(TIME_MARK.length).trim() : '';
  return when ? { place, when } : { place };
};

/** Link per cercare il luogo sulle mappe. Si costruisce al tocco: non viaggia nel messaggio. */
export const mapsSearchUrl = (place: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
