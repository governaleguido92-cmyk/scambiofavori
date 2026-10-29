import { Alert } from 'react-native';

export interface ToastMessage {
  id: number;
  title: string;
  message?: string;
}

type ToastListener = (toast: ToastMessage) => void;

let listener: ToastListener | null = null;
let nextId = 1;

/** Called by <ToastHost /> when it mounts; returns the unsubscribe function. */
export function registerToastListener(next: ToastListener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/**
 * Non-blocking replacement for `Alert.alert(title, message)`.
 * Falls back to a native alert if no host is mounted yet (e.g. very early errors).
 */
export function notify(title: string, message?: string): void {
  if (listener) {
    listener({ id: nextId++, title, message });
    return;
  }
  Alert.alert(title, message);
}
