import type { Favor } from '../services/api';

/**
 * Come si chiama il tipo di un favore, dal punto di vista di chi guarda:
 *  - un favore degli altri: "Dona" (è una richiesta: puoi aiutare) o "Ricevi" (è un'offerta: puoi farti aiutare);
 *  - un tuo favore: "Ricevo" (hai chiesto aiuto) o "Dono" (hai offerto aiuto).
 */
export function favorKindLabel(type: string, isOwn: boolean): string {
  if (isOwn) return type === 'offer' ? 'Dono' : 'Ricevo';
  return type === 'offer' ? 'Ricevi' : 'Dona';
}

/**
 * Chi guarda guadagna o spende Granelli in questo favore? Guadagna chi esegue (aiuta), spende chi riceve.
 *  - richiesta: aiuta chi accetta (se è ancora aperta, chiunque non sia l'autore); riceve l'autore;
 *  - offerta: aiuta l'autore; riceve chi accetta (se è ancora aperta, chiunque non sia l'autore).
 */
export function earnsGranelli(favor: Pick<Favor, 'type' | 'creator_id' | 'accepted_by'>, userId: string | undefined): boolean {
  const isCreator = !!userId && favor.creator_id === userId;
  if (favor.type === 'request') {
    return favor.accepted_by ? favor.accepted_by === userId : !isCreator;
  }
  return isCreator;
}

/** «Guadagni» / «Spendi» (o «Guadagnato» / «Speso» a favore concluso): da mostrare accanto ai Granelli. */
export function granelliFlowLabel(
  favor: Pick<Favor, 'type' | 'creator_id' | 'accepted_by' | 'status'>,
  userId: string | undefined,
): string {
  const earns = earnsGranelli(favor, userId);
  if (favor.status === 'completed') return earns ? 'Guadagnato' : 'Speso';
  return earns ? 'Guadagni' : 'Spendi';
}
