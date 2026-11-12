import React, { useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TextSize = 'normal' | 'large' | 'xlarge';

export const TEXT_SIZES: ReadonlyArray<{ key: TextSize; scale: number; label: string }> = [
  { key: 'normal', scale: 1, label: 'Normale' },
  { key: 'large', scale: 1.15, label: 'Grande' },
  { key: 'xlarge', scale: 1.3, label: 'Molto grande' },
];

const STORAGE_KEY = 'text_size';
const DEFAULT_FONT_SIZE = 14;

let current: TextSize = 'normal';
const listeners = new Set<() => void>();

const scaleOf = (size: TextSize): number => TEXT_SIZES.find((item) => item.key === size)?.scale ?? 1;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getTextSize = (): TextSize => current;

export const setTextSize = (size: TextSize): void => {
  current = size;
  listeners.forEach((listener) => listener());
  AsyncStorage.setItem(STORAGE_KEY, size).catch(() => undefined);
};

/** Legge la scelta salvata: va chiamata una volta all'avvio. */
export const loadTextSize = async (): Promise<void> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'normal' || saved === 'large' || saved === 'xlarge') {
      current = saved;
      listeners.forEach((listener) => listener());
    }
  } catch {
    // Senza memoria locale si resta sulla dimensione normale
  }
};

export const useTextSize = (): TextSize => useSyncExternalStore(subscribe, getTextSize, getTextSize);

let patched = false;

/**
 * Ingrandisce tutti i testi dell'app con una sola impostazione (utile per chi vede poco).
 * Avvolge il render di Text: scala fontSize e lineHeight dello stile, senza toccare le singole schermate.
 */
export const installTextScaling = (): void => {
  const target = Text as unknown as { render?: (props: any, ref: any) => React.ReactElement | null };
  if (patched || typeof target.render !== 'function') return;
  patched = true;
  const original = target.render;
  // Nome con la maiuscola: per React (e per il lint) è il render di un componente, quindi può usare gli hook
  target.render = function ScaledTextRender(props: any, ref: any) {
    const size = useTextSize();
    const scale = scaleOf(size);
    if (scale === 1) return original.call(this, props, ref);
    const flat = StyleSheet.flatten(props.style) || {};
    const style = {
      ...flat,
      fontSize: (flat.fontSize ?? DEFAULT_FONT_SIZE) * scale,
      ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}),
    };
    return original.call(this, { ...props, style }, ref);
  };
};
