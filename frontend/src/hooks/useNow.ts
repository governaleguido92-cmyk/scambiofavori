import { useSyncExternalStore } from 'react';

/**
 * Orologio condiviso che batte ogni secondo. Un solo timer per tutta l'app, qualunque sia il numero di
 * conti alla rovescia sullo schermo; si ferma da solo quando nessuno lo usa più.
 */
const TICK_MS = 1000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

const tick = (): void => {
  now = Date.now();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getSnapshot = (): number => now;

/** Millisecondi attuali, aggiornati ogni secondo. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
