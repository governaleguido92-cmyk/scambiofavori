import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { api } from '../services/api';

type Position = { latitude: number; longitude: number };

/** Posizione del telefono solo se il permesso è già stato dato: qui non si chiede di nuovo. */
const phonePosition = async (): Promise<Position | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
  } catch {
    return null;
  }
};

/**
 * Il paese in cui si opera (dai favori aperti o dalla posizione del telefono), ricaricato ogni volta che la
 * schermata torna in primo piano. `position` evita di chiederla di nuovo quando la schermata la conosce già.
 * null se non si trova: chi lo usa mostra la frase generica.
 */
export function useNeighborhoodCity(token: string | null | undefined, position?: Position | null): string | null {
  const [city, setCity] = useState<string | null>(null);
  const latitude = position?.latitude;
  const longitude = position?.longitude;

  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      let active = true;
      const known = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
      (known ? Promise.resolve(known) : phonePosition())
        .then((where) => api.getNeighborhoodCity(token, where))
        .then((result) => {
          if (active) setCity(result.city);
        })
        .catch(() => {
          if (active) setCity(null);
        });
      return () => {
        active = false;
      };
    }, [token, latitude, longitude])
  );

  return city;
}
