import type { Favor } from '../services/api';
import { serverTime } from './serverDate';

export type MyFavorTab = 'ongoing' | 'published' | 'closed';

export interface FavorGroups {
  ongoing: Favor[];
  published: Favor[];
  closed: Favor[];
}

/** Un favore pubblicato ma non accettato è scaduto quando la data di scadenza è passata. */
export const isExpired = (favor: Pick<Favor, 'status' | 'expires_at'>, now: number = Date.now()): boolean => {
  if (favor.status !== 'active' || !favor.expires_at) return false;
  const end = serverTime(favor.expires_at);
  return !Number.isNaN(end) && end < now;
};

/** In quale scheda de "I Miei" compare il favore. */
export const tabOf = (favor: Pick<Favor, 'status'>): MyFavorTab => {
  if (favor.status === 'accepted') return 'ongoing';
  if (favor.status === 'active') return 'published';
  return 'closed';
};

export const groupByTab = (favors: Favor[]): FavorGroups => ({
  ongoing: favors.filter((favor) => tabOf(favor) === 'ongoing'),
  published: favors.filter((favor) => tabOf(favor) === 'published'),
  closed: favors.filter((favor) => tabOf(favor) === 'closed'),
});

export type Relation = 'waiting' | 'iHelp' | 'helpsMe';

export interface Role {
  relation: Relation;
  /** Nome dell'altra persona, se c'è. */
  otherName?: string;
}

/**
 * Chi aiuta chi. In una richiesta aiuta chi accetta; in un'offerta aiuta chi l'ha creata.
 * Senza qualcuno che ha accettato il favore è ancora in attesa.
 */
export const roleOf = (favor: Favor, userId: string | undefined): Role => {
  if (!favor.accepted_by) return { relation: 'waiting' };
  const helperId = favor.type === 'request' ? favor.accepted_by : favor.creator_id;
  const iAmCreator = favor.creator_id === userId;
  const otherName = iAmCreator ? favor.accepted_by_name : favor.creator_name;
  return { relation: helperId === userId ? 'iHelp' : 'helpsMe', otherName };
};

/** Il favore lo chiude chi lo riceve: nelle richieste chi le ha create, nelle offerte chi le ha accettate. */
export const canComplete = (favor: Favor, userId: string | undefined): boolean => {
  if (favor.status !== 'accepted' || !userId) return false;
  const receiverId = favor.type === 'request' ? favor.creator_id : favor.accepted_by;
  return receiverId === userId;
};

/**
 * Come si completa un favore, con il QR: chi lo riceve lo mostra ("show"), chi lo esegue lo scansiona ("scan").
 * Senza QR non si completa. Se non partecipi o il favore non è in corso: null.
 */
export const qrRole = (favor: Favor, userId: string | undefined): 'show' | 'scan' | null => {
  if (favor.status !== 'accepted' || !userId || !favor.accepted_by) return null;
  if (favor.creator_id !== userId && favor.accepted_by !== userId) return null;
  return canComplete(favor, userId) ? 'show' : 'scan';
};
