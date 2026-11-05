import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface GranelloIconProps {
  /** Grandezza della spiga: la moneta intorno è un po' più grande. */
  size?: number;
  /** Colore della moneta (arancione del logo di default). */
  color?: string;
}

/** Quanto la moneta è più grande della spiga che contiene. */
const COIN_SCALE = 1.8;

/**
 * Icona dei Granelli: una moneta piena arancione con la spiga bianca dentro.
 * La spiga a linea da sola, a 14 pixel, si perdeva sullo sfondo scuro; la moneta si riconosce subito e dice «valuta».
 */
export function GranelloIcon({ size = 16, color = colors.accent }: GranelloIconProps) {
  const coin = Math.round(size * COIN_SCALE);
  return (
    <View
      style={[styles.coin, { width: coin, height: coin, borderRadius: coin / 2, backgroundColor: color }]}
      accessibilityLabel="Granelli"
    >
      <MaterialCommunityIcons name="barley" size={Math.round(size * 1.15)} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  coin: { alignItems: 'center', justifyContent: 'center' },
});

export default GranelloIcon;
