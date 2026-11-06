import { tt, tx } from '../i18n/tt';

/** Nome del livello di fiducia mostrato nei profili. */
export function trustLevelLabel(level: number): string {
  switch (level) {
    case 0: return tt('Da verificare');
    case 1: return tt('Nuovo vicino');
    case 2: return tt('Vicino affidabile');
    default: return tt('Vicino verificato');
  }
}

/** Frase sui limiti dei nuovi utenti; vuota per chi ha già sbloccato tutto. */
export function newUserHint(favorsToNextLevel: number | null, maxOpen: number | null, maxHours: number | null): string {
  if (favorsToNextLevel === null || maxOpen === null || maxHours === null) return '';
  return tx(
    'Per ora puoi avere {0} favori in attesa e fino a {1} ore a favore. Completa ancora {2} favori per sbloccare tutto.',
    [maxOpen, maxHours, favorsToNextLevel]
  );
}

/** Percentuale di annullamenti dopo l'accettazione, o testo vuoto se non ce ne sono. */
export function cancelRateLabel(rate: number, lateCancellations: number): string {
  if (lateCancellations === 0) return '';
  return tx('Annullati dopo l\'accettazione: {0}%', [Math.round(rate * 100)]);
}
