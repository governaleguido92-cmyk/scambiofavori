export const MIN_AGE = 18;
const MAX_AGE = 120;

/** Mentre si scrive 15062000 mostra 15/06/2000: aggiunge da solo le barre. */
export function formatBirthInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export type BirthDateCheck =
  | { ok: true; iso: string }
  | { ok: false; reason: 'incomplete' | 'invalid' | 'underage' };

/** Controlla gg/mm/aaaa e restituisce la data nel formato AAAA-MM-GG per il server. */
export function checkBirthDate(text: string, today: Date = new Date()): BirthDateCheck {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return { ok: false, reason: 'incomplete' };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const birth = new Date(year, month - 1, day);
  const isRealDate = birth.getFullYear() === year && birth.getMonth() === month - 1 && birth.getDate() === day;
  if (!isRealDate || birth > today) return { ok: false, reason: 'invalid' };

  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  if (age > MAX_AGE) return { ok: false, reason: 'invalid' };
  if (age < MIN_AGE) return { ok: false, reason: 'underage' };
  return { ok: true, iso: `${match[3]}-${match[2]}-${match[1]}` };
}
