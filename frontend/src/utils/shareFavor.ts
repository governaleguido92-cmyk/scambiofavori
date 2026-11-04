import { Favor } from '../services/api';
import { tt, tx } from '../i18n/tt';

/**
 * Testo da mandare a una persona fidata prima di un favore.
 * Contiene solo titolo e nome dell'altra persona: mai indirizzo, coordinate o telefono.
 */
export function buildShareText(favor: Pick<Favor, 'title'>, otherName?: string | null): string {
  const who = otherName?.trim() || tt('un vicino');
  return tx(
    'Sto per fare un favore con {0} su Scambio Favori: "{1}". Ti scrivo quando ho finito.',
    [who, favor.title.trim()]
  );
}
