import * as Location from 'expo-location';

export interface ConfirmPosition {
  latitude: number;
  longitude: number;
  /** Incertezza del GPS in metri, se il telefono la dichiara. */
  accuracy?: number;
}

const POSITION_TIMEOUT_MS = 8000;

/**
 * Posizione al momento di confermare un favore, per verificare che si sia vicini al luogo.
 * Se il permesso è negato o il GPS non risponde in tempo restituisce null: la conferma passa comunque.
 * La posizione non viene conservata dal server: serve solo per calcolare la distanza.
 */
export async function getConfirmationPosition(): Promise<ConfirmPosition | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)),
    ]);
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}
