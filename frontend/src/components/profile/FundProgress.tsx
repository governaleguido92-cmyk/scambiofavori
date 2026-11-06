import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt, tx } from '../../i18n/tt';

/** Volte che si deve aver aiutato un vicino per donare al Fondo Solidarietà: come il badge «Eroe di Quartiere». */
export const FUND_UNLOCK_FAVORS = 5;

interface Props {
  /** Favori in cui hai aiutato un vicino. */
  done: number;
  /** Ha già il badge «Eroe di Quartiere»: il Fondo è già aperto. */
  unlocked: boolean;
}

/** In Profilo, finché il Fondo è chiuso: quanti favori mancano, così non si scopre il limite toccando «Dona». */
export function FundProgress({ done, unlocked }: Props) {
  if (unlocked || done >= FUND_UNLOCK_FAVORS) return null;
  const shown = Math.max(0, done);
  return (
    <View style={styles.card} data-testid="fund-progress">
      <View style={styles.row}>
        <Ionicons name="heart-circle" size={20} color={colors.accent} />
        <Text style={styles.title}>{tt('Fondo Solidarietà')}</Text>
      </View>
      <Text style={styles.text}>{tt('Si apre dopo 5 volte che aiuti un vicino: potrai donare Granelli a chi ne ha bisogno.')}</Text>
      <View style={styles.track} accessibilityLabel={tx('{0} aiuti su {1} per sbloccare il Fondo', [shown, FUND_UNLOCK_FAVORS])}>
        <View style={[styles.fill, { width: `${Math.min(100, (shown / FUND_UNLOCK_FAVORS) * 100)}%` }]} />
      </View>
      <Text style={styles.count}>{tx('{0} aiuti su {1} per sbloccare il Fondo', [shown, FUND_UNLOCK_FAVORS])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundCard, borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  text: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.backgroundLight, overflow: 'hidden', marginTop: 10 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  count: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 6 },
});
