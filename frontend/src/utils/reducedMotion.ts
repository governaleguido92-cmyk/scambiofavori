import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Rispetta l'impostazione «Riduci animazioni» del telefono: niente pulsazioni continue e niente finestre che scivolano.
 * Il valore si legge una volta all'avvio e si aggiorna se l'utente cambia l'impostazione.
 */
let reduced = false;
const listeners = new Set<() => void>();
const set = (value: boolean): void => {
  reduced = value;
  listeners.forEach((listener) => listener());
};

AccessibilityInfo.isReduceMotionEnabled?.().then(set).catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isReducedMotion = (): boolean => reduced;

/** Per le finestre (Modal): dissolvenza al posto dello scivolamento se le animazioni sono ridotte. */
export const modalAnimation = (): 'fade' | 'slide' => (reduced ? 'fade' : 'slide');

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, isReducedMotion);
}
