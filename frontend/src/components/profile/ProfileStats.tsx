import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCY_SYMBOL, User } from '../../services/api';
import { styles } from '../../styles/profile.styles';
import { tt } from '../../i18n/tt';
import { granelliWord } from '../../utils/granelli';

interface ProfileStatsProps {
  user: User | null;
}

/** Quattro numeri: saldo, favori fatti, favori ricevuti, ore donate. Le etichette sono le stesse di "I Miei". */
export function ProfileStats({ user }: ProfileStatsProps) {
  const balance = user?.granelli || 0;
  return (
    <View style={styles.statsGrid}>
      <View style={styles.statCard} accessible accessibilityLabel={`${balance} ${granelliWord(balance)}`}>
        <Text style={styles.statSymbol}>{CURRENCY_SYMBOL}</Text>
        <Text style={styles.statValue}>{balance}</Text>
        <Text style={styles.statLabel}>{granelliWord(balance)}</Text>
      </View>
      <View style={styles.statCard} accessible accessibilityLabel={`${tt('Hai aiutato')} ${user?.total_favors_given || 0}`}>
        <Ionicons name="gift" size={32} color="#B8C868" />
        <Text style={styles.statValue}>{user?.total_favors_given || 0}</Text>
        <Text style={styles.statLabel}>{tt('Hai aiutato')}</Text>
      </View>
      <View style={styles.statCard} accessible accessibilityLabel={`${tt('Hai ricevuto')} ${user?.total_favors_received || 0}`}>
        <Ionicons name="hand-left" size={32} color="#ff6b6b" />
        <Text style={styles.statValue}>{user?.total_favors_received || 0}</Text>
        <Text style={styles.statLabel}>{tt('Hai ricevuto')}</Text>
      </View>
      <View style={styles.statCard} accessible accessibilityLabel={`${tt('Ore Donate')} ${(user?.total_hours_helped || 0).toFixed(1)}`}>
        <Ionicons name="time" size={32} color="#F87828" />
        <Text style={styles.statValue}>{(user?.total_hours_helped || 0).toFixed(1)}h</Text>
        <Text style={styles.statLabel}>{tt('Ore Donate')}</Text>
      </View>
    </View>
  );
}
