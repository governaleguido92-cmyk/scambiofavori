import type { Favor } from '../services/api';
import { tt, tx } from '../i18n/tt';
import { isExpired, roleOf } from './myFavors';

export const STATUS_COLORS = {
  waiting: '#C9A227',
  expired: '#6B7F72',
  ongoing: '#2F7A4D',
  completed: '#2F8F5B',
  cancelled: '#8A8A8A',
} as const;

/** Etichetta e colore dello stato di un favore (In attesa, In corso, Concluso...). */
export const statusOf = (favor: Pick<Favor, 'status' | 'expires_at'>): { label: string; color: string } => {
  if (favor.status === 'accepted') return { label: tt('In corso'), color: STATUS_COLORS.ongoing };
  if (favor.status === 'completed') return { label: tt('Concluso'), color: STATUS_COLORS.completed };
  if (favor.status === 'cancelled') return { label: tt('Annullato'), color: STATUS_COLORS.cancelled };
  if (isExpired(favor)) return { label: tt('Scaduto'), color: STATUS_COLORS.expired };
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
