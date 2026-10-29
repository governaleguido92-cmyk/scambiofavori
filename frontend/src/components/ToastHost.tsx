import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { registerToastListener, ToastMessage } from '../utils/notify';

const VISIBLE_MS = 4500;
const ERROR_TITLE = /errore|impossibile|non valid|error|unable|invalid/i;

/** Shows the latest `notify()` message at the top of the screen, above every route. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  useEffect(() => {
    const unsubscribe = registerToastListener((next) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(next);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(hide, VISIBLE_MS);
    });
    return () => {
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [hide, opacity]);

  if (!toast) return null;

  const isError = ERROR_TITLE.test(toast.title);
  const accent = isError ? colors.error : colors.lime;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { top: insets.top + 8, opacity }]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={hide}
        style={[styles.toast, { borderLeftColor: accent }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={toast.message ? `${toast.title}. ${toast.message}` : toast.title}
      >
        <Ionicons name={isError ? 'alert-circle' : 'checkmark-circle'} size={22} color={accent} />
        <View style={styles.textBox}>
          <Text style={styles.title}>{toast.title}</Text>
          {!!toast.message && <Text style={styles.message}>{toast.message}</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  textBox: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  message: { color: colors.textSecondary, fontSize: 14, lineHeight: 19, marginTop: 2 },
});
