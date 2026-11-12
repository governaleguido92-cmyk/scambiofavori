import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';
import { goBackOrHome } from '../utils/navigation';
import { HEADER_ICON_HIT_SLOP } from '../utils/touch';

interface StartGateProps {
  /** Il nome della sezione chiusa, già tradotto: «Il Quartiere», «I Messaggi», «I tuoi favori». */
  area: string;
}

/** Al posto di una sezione chiusa finché la persona non ha pubblicato o accettato il primo favore. */
export function StartGate({ area }: StartGateProps) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} data-testid="start-gate">
      <TouchableOpacity
        style={styles.back}
        onPress={() => goBackOrHome(router)}
        accessibilityRole="button"
        accessibilityLabel={tt('Indietro')}
        hitSlop={HEADER_ICON_HIT_SLOP}
      >
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name="lock-closed" size={30} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">{area}</Text>
        <Text style={styles.text}>
          {tt('Si apre dopo il tuo primo passo: pubblica un favore o accettane uno di un vicino.')}
        </Text>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => router.push('/create' as never)}
          accessibilityRole="button"
          data-testid="start-gate-create"
        >
          <Ionicons name="add-circle" size={20} color={colors.background} />
          <Text style={styles.primaryText}>{tt('Pubblica un favore')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.push('/map' as never)}
          accessibilityRole="button"
          data-testid="start-gate-browse"
        >
          <Ionicons name="hand-left" size={20} color={colors.textPrimary} />
          <Text style={styles.secondaryText}>{tt('Accetta il favore di un vicino')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  back: { padding: 16, alignSelf: 'flex-start' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 80, gap: 12 },
  icon: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 340, marginBottom: 8 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', maxWidth: 360,
    minHeight: 52, borderRadius: 14, backgroundColor: colors.accent,
  },
  primaryText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', maxWidth: 360,
    minHeight: 52, borderRadius: 14, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  secondaryText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
});
