import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface GranelloIconProps {
  size?: number;
  color?: string;
}

/** Icona dei Granelli: una spiga a linea, nei colori del logo (oliva di default). */
export function GranelloIcon({ size = 16, color = colors.lime }: GranelloIconProps) {
  return <MaterialCommunityIcons name="barley" size={size} color={color} accessibilityLabel="Granelli" />;
}

export default GranelloIcon;
