/**
 * Come si chiama il tipo di un favore, dal punto di vista di chi guarda:
 *  - un favore degli altri: "Dona" (è una richiesta: puoi aiutare) o "Ricevi" (è un'offerta: puoi farti aiutare);
 *  - un tuo favore: "Ricevo" (hai chiesto aiuto) o "Dono" (hai offerto aiuto).
 */
export function favorKindLabel(type: string, isOwn: boolean): string {
  if (isOwn) return type === 'offer' ? 'Dono' : 'Ricevo';
  return type === 'offer' ? 'Ricevi' : 'Dona';
}
