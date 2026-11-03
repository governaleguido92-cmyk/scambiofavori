import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMessages } from '../context/MessagesContext';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';

interface MessagesButtonProps {
  /** Diametro del pulsante: 36 nell'intestazione della Home, 44 in "I Miei". */
  size?: number;
}

/** Pulsante tondo con il fumetto: apre l'elenco dei messaggi e mostra quanti non letti ci sono. */
export function MessagesButton({ size = 44 }: MessagesButtonProps) {
  const router = useRouter();
  const { unread } = useMessages();
  const label = unread > 0 ? `${tt('Messaggi')}, ${unread} ${tt('non letti')}` : tt('Messaggi');

  return (
    <TouchableOpacity
      style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={() => router.push('/conversations' as never)}
      accessibilityRole="button"
      accessibilityLabel={label}
      data-testid="open-conversations"
    >
      <Ionicons name="chatbubble" size={Math.round(size * 0.5)} color={colors.textPrimary} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.background, fontSize: 10, fontWeight: '900' },
});
