/** Posizionamento dei favori attorno all'utente (vista "radar"): direzione reale, distanza in scala radice. */

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Direzione iniziale da A a B in gradi (0 = nord, 90 = est). */
export const bearingDeg = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Angolo stabile ricavato dall'id, per i favori senza coordinate: stesso id, stessa posizione. */
export const fallbackBearing = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 360;
};

export interface RadarPoint {
  /** Spostamento dal centro, in pixel (x verso destra, y verso il basso). */
  x: number;
  y: number;
}

/**
 * Sposta un favore dal centro. La distanza è in scala radice quadrata, così i favori vicini non si
 * ammassano al centro: l'anello a metà corsa vale un quarto del raggio.
 */
export const radarOffset = (
  distanceKm: number,
  bearing: number,
  radiusKm: number,
  radiusPx: number
): RadarPoint => {
  const ratio = Math.min(1, Math.max(0, distanceKm / radiusKm));
  const r = Math.sqrt(ratio) * radiusPx;
  const angle = toRad(bearing);
  return { x: r * Math.sin(angle), y: -r * Math.cos(angle) };
};
