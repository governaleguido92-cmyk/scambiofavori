import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/** Ogni quanto si aggiornano le schermate "dal vivo": chat, avvisi ed elenchi di favori. */
export const LIVE_REFRESH_MS = 3000;

/**
 * Richiama `refresh` ogni `intervalMs` finché la schermata è in primo piano. Non parte subito (chi la usa fa già il primo
 * caricamento) e non lancia un nuovo giro se il precedente non è ancora finito, così una rete lenta non accumula richieste.
 */
export function useLiveRefresh(refresh: () => Promise<unknown> | void, intervalMs: number = LIVE_REFRESH_MS): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  const running = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(async () => {
        if (running.current) return;
        running.current = true;
        try {
          await latest.current();
        } finally {
          running.current = false;
        }
      }, intervalMs);
      return () => clearInterval(timer);
    }, [intervalMs])
  );
}
