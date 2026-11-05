import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';

interface NeighborhoodButtonProps {
  /** Diametro del pulsante: 36 nell'intestazione della Home. */
  size?: number;
}

/** Pulsante tondo "Il Nostro Quartiere": una casetta con un fumetto arancione. */
export function NeighborhoodButton({ size = 36 }: NeighborhoodButtonProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={() => router.push('/quartiere' as never)}
      accessibilityRole="button"
      accessibilityLabel={tt('Il Nostro Quartiere')}
      data-testid="open-neighborhood-header"
    >
      <Ionicons name="home" size={Math.round(size * 0.5)} color={colors.textPrimary} />
      <View style={styles.bubble}>
        <Ionicons name="chatbubble" size={Math.round(size * 0.34)} color={colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    position: 'absolute',
    top: 3,
    right: 2,
  },
});
