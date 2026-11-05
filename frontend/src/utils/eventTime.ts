/** Orari rapidi per organizzare un evento senza calendario: un giorno + un'ora, tutto nel fuso del telefono. */

export const EVENT_DAY_OPTIONS: ReadonlyArray<{ offset: number }> = [{ offset: 0 }, { offset: 1 }, { offset: 2 }, { offset: 3 }, { offset: 7 }];
export const EVENT_HOUR_OPTIONS: ReadonlyArray<number> = [9, 11, 16, 18, 20];

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Data e ora di inizio (ISO) per "tra N giorni alle H:00". */
export function buildStart(dayOffset: number, hour: number, now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
  return start.toISOString();
}

/** Giorno scelto, in italiano corto: "Oggi", "Domani" o "sab 8 nov". */
export function dayLabel(dayOffset: number, now: Date = new Date()): string {
  if (dayOffset === 0) return 'Oggi';
  if (dayOffset === 1) return 'Domani';
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Inizio di un evento già creato: "sab 8 nov, 18:00" (o "Oggi, 18:00"). */
export function formatEventStart(iso: string, now: Date = new Date()): string {
  const start = new Date(iso);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((startDay - today) / 86400000);
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 0) return `Oggi, ${time}`;
  if (diffDays === 1) return `Domani, ${time}`;
  return `${WEEKDAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}, ${time}`;
}
