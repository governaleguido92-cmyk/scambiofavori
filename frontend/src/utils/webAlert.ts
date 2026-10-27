import { Alert, AlertButton, Platform } from 'react-native';

/**
 * React Native's Alert.alert is a no-op on web, so errors and confirmations are invisible.
 * Install browser-dialog based behaviour once at startup; native platforms are untouched.
 *
 * - 0 or 1 button: window.alert, then run that button's onPress.
 * - 2+ buttons: window.confirm; OK runs the first non-cancel button, Cancel runs the cancel button.
 */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]): void => {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancelButton = buttons.find((button) => button.style === 'cancel');
    const confirmButton = buttons.find((button) => button !== cancelButton);
    if (window.confirm(text)) {
      confirmButton?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
  };
}
