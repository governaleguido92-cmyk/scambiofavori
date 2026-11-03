import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';

interface PhoneStatusProps {
  verified: boolean;
  masked: string | null;
}

/** Nel profilo: "Telefono verificato" oppure il pulsante per verificarlo con il codice via SMS. */
export function PhoneStatus({ verified, masked }: PhoneStatusProps) {
  const router = useRouter();

  if (verified) {
    return (
      <View style={styles.verified} accessibilityLabel={tt('Telefono verificato')}>
        <Ionicons name="shield-checkmark" size={15} color={colors.lime} />
        <Text style={styles.verifiedText}>{tt('Telefono verificato')}{masked ? `  ${masked}` : ''}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.verify}
      onPress={() => router.push('/verify-phone' as never)}
      accessibilityRole="button"
      accessibilityLabel={tt('Verifica il telefono')}
      data-testid="verify-phone-button"
    >
      <Ionicons name="call" size={15} color={colors.background} />
      <Text style={styles.verifyText}>{tt('Verifica il telefono')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  verifiedText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  verify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  verifyText: { color: colors.background, fontSize: 13, fontWeight: '800' },
});
