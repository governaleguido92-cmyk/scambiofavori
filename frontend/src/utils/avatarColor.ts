/** I colori del logo: verde oliva e arancione. Le iniziali degli utenti usano solo questi due, mai altri colori. */
const AVATAR_BACKGROUNDS = ['#98AA4A', '#F87828'] as const;
/** Testo scuro su entrambi: contrasto oltre 7:1 (il bianco sull'oliva e sull'arancione chiaro è troppo debole). */
const AVATAR_TEXT = '#0C0E09';

function hashName(name: string): number {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * Sfondo e colore del testo per le iniziali di un utente: oliva o arancione, sempre lo stesso per la stessa persona
 * (scelto dal nome), così in ogni schermata riconosci chi è dal colore.
 */
export function avatarColors(name: string | undefined | null): { backgroundColor: string; color: string } {
  const background = AVATAR_BACKGROUNDS[hashName(name || '') % AVATAR_BACKGROUNDS.length];
  return { backgroundColor: background, color: AVATAR_TEXT };
}

/**
 * Dentro un favore le iniziali seguono il tipo del favore per chi guarda: arancione = «Dona» (guadagni),
 * verde oliva = «Ricevi» (spendi). Così la scheda, la chat e il dettaglio hanno lo stesso colore.
 */
export function avatarColorsForKind(isGive: boolean): { backgroundColor: string; color: string } {
  return { backgroundColor: AVATAR_BACKGROUNDS[isGive ? 1 : 0], color: AVATAR_TEXT };
}
