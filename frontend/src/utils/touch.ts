/**
 * Area di tocco minima: 48 punti (Android) anche per i pulsanti con sola icona disegnati più piccoli.
 * Si allarga la zona sensibile con hitSlop, senza cambiare il disegno.
 */
export const MIN_TOUCH_SIZE = 48;

export const hitSlopFor = (visualSize: number) => {
  const extra = Math.max(0, Math.ceil((MIN_TOUCH_SIZE - visualSize) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
};

/** Per i pulsanti tondi da 40 usati nelle intestazioni (indietro, chat, QR, segnala). */
export const HEADER_ICON_HIT_SLOP = hitSlopFor(40);
