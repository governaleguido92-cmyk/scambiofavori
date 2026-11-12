import type { Favor } from '../services/api';
import { tt, tx } from '../i18n/tt';
import { isExpired, roleOf } from './myFavors';
import { serverTime } from './serverDate';
import colors from '../theme/colors';

export const STATUS_COLORS = {
  waiting: colors.primary,
  waitingLong: colors.accent,
  expired: colors.textMuted,
  ongoing: colors.primary,
  completed: colors.primary,
  cancelled: colors.textMuted,
} as const;

/** Etichetta e colore dello stato di un favore (In attesa, In corso, Concluso...). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Giorni interi da quando il favore è pubblicato e nessuno lo ha accettato; 0 se è ancora fresco. */
export const waitingDays = (favor: Pick<Favor, 'status' | 'created_at'>, now: number = Date.now()): number => {
  if (favor.status !== 'active') return 0;
  const created = serverTime(favor.created_at);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / DAY_MS));
};

export const statusOf = (favor: Pick<Favor, 'status' | 'expires_at' | 'created_at'>): { label: string; color: string } => {
  if (favor.status === 'accepted') return { label: tt('In corso'), color: STATUS_COLORS.ongoing };
  if (favor.status === 'completed') return { label: tt('Concluso'), color: STATUS_COLORS.completed };
  if (favor.status === 'cancelled') return { label: tt('Annullato'), color: STATUS_COLORS.cancelled };
  if (isExpired(favor)) return { label: tt('Scaduto'), color: STATUS_COLORS.expired };
  const waited = waitingDays(favor);
  if (waited >= 1) return { label: tx('In attesa da {0} g', [waited]), color: STATUS_COLORS.waitingLong };
  return { label: tt('In attesa'), color: STATUS_COLORS.waiting };
};

/** La riga che dice chi aiuta chi: "Stai aiutando Marta", "Marta ti sta aiutando"... */
export const roleText = (favor: Favor, userId: string | undefined): string => {
  if (favor.status === 'cancelled') return tt('Favore annullato');
  const { relation, otherName } = roleOf(favor, userId);
  const name = otherName || tt('un vicino');
  const done = favor.status === 'completed';
  if (relation === 'iHelp') return tx(done ? 'Hai aiutato {0}' : 'Stai aiutando {0}', [name]);
  if (relation === 'helpsMe') return tx(done ? '{0} ti ha aiutato' : '{0} ti sta aiutando', [name]);
  return isExpired(favor) ? tt('Nessuno ha accettato in tempo') : tt('In attesa di qualcuno che accetti');
};
