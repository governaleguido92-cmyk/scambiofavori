import React from 'react';
import { StyleSheet, Text } from 'react-native';
import colors from '../../theme/colors';

/** Titolo di una sezione del Profilo (Io, Il mio percorso, La mia comunità). */
export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.title} accessibilityRole="header">{children}</Text>;
}

const styles = StyleSheet.create({
  title: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
});
