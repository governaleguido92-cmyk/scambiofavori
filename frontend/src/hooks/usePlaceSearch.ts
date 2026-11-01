import { useCallback, useEffect, useRef, useState } from 'react';
import { api, PlaceSuggestion } from '../services/api';
import { logger } from '../utils/logger';

export interface PlaceSearchState {
  places: PlaceSuggestion[];
  loading: boolean;
  /** Messaggio da mostrare quando la ricerca non è andata a buon fine. */
  error: string | null;
  /** true dopo la prima ricerca: distingue "nessun risultato" da "non ho ancora cercato". */
  searched: boolean;
  attribution: string | null;
}

const IDLE: PlaceSearchState = { places: [], loading: false, error: null, searched: false, attribution: null };

/**
 * Cerca luoghi vicino al favore, per categoria o per nome. Una nuova ricerca annulla la precedente, così
 * una risposta lenta e vecchia non copre quella nuova.
 */
export function usePlaceSearch(favorId: string, token: string | null) {
  const [state, setState] = useState<PlaceSearchState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    async (search: { category?: string; q?: string }) => {
      if (!token) return;
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ ...IDLE, loading: true });
      try {
        const response = await api.getMeetingPlaces(favorId, search, token, controller.signal);
        if (controller.signal.aborted) return;
        setState({ places: response.places, loading: false, error: null, searched: true, attribution: response.attribution });
      } catch (error: any) {
        if (controller.signal.aborted) return;
        logger.debug('Place search failed:', error);
        setState({ ...IDLE, searched: true, error: error?.message || null });
      }
    },
    [favorId, token, cancel]
  );

  const clear = useCallback(() => {
    cancel();
    setState(IDLE);
  }, [cancel]);

  // Funzioni stabili: chi le usa in un effetto non deve vederle cambiare a ogni disegno
  const searchCategory = useCallback((category: string) => run({ category }), [run]);
  const searchText = useCallback((q: string) => run({ q }), [run]);

  return { ...state, searchCategory, searchText, clear };
}
