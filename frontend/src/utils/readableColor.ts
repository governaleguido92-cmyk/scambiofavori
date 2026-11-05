const DARK_TEXT = '#0C0E09';
const LIGHT_TEXT = '#FFFFFF';
/** Contrasto minimo WCAG per il testo grande o in grassetto (titoli, pulsanti). */
export const MIN_CONTRAST_LARGE_TEXT = 3;
/** Contrasto minimo WCAG per il testo piccolo. */
export const MIN_CONTRAST_SMALL_TEXT = 4.5;

function channelToLinear(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

/** Luminanza relativa (0 nero, 1 bianco) di un colore #RGB o #RRGGBB. Se non si capisce il colore, si assume medio. */
export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0.5;
  const digits = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => channelToLinear(parseInt(digits.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const [lighter, darker] = luminanceA > luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Colore del testo che si legge su uno sfondo: bianco se il contrasto è sufficiente, altrimenti quasi nero.
 * I colori delle categorie vanno dal bianco al verde oliva all'arancione: un colore fisso non va bene per tutti.
 */
export function readableTextColor(background: string, minContrastForWhite: number = MIN_CONTRAST_LARGE_TEXT): string {
  const luminance = relativeLuminance(background);
  return contrastRatio(1, luminance) >= minContrastForWhite ? LIGHT_TEXT : DARK_TEXT;
}
