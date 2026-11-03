import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface BrandLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/** Il logo dell'app (mani e cuore), da mettere in alto a sinistra di ogni schermata. */
export function BrandLogo({ size = 30, style }: BrandLogoProps) {
  return (
    <Image
      source={require('../../assets/images/logo.png')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Scambio Favori"
    />
  );
}
