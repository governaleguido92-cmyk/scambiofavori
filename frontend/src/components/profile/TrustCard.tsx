import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { api, TrustStatus } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { newUserHint, trustLevelLabel } from '../../utils/trustLevels';

/** Nel proprio profilo: livello di fiducia, garanzie ricevute e limiti dei nuovi utenti. */
export function TrustCard({ token }: { token: string }) {
  const [trust, setTrust] = useState<TrustStatus | null>(null);

  useEffect(() => {
    api.getMyTrust(token).then(setTrust).catch(() => setTrust(null));
  }, [token]);

  if (!trust) return null;
  const hint = newUserHint(trust.favors_to_next_level, trust.max_open_favors, trust.max_hours);

  return (
    <View style={styles.card} data-testid="trust-card">
      <View style={styles.row}>
        <Ionicons name="shield-checkmark" size={18} color={colors.lime} />
        <Text style={styles.level}>{trustLevelLabel(trust.trust_level)}</Text>
        {trust.vouch_count > 0 && (
          <Text style={styles.vouches}>{tx('{0} garanzie', [trust.vouch_count])}</Text>
        )}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {trust.safety_hold ? (
        <Text style={styles.warning}>{tt('Il tuo account è in revisione per segnalazioni di sicurezza.')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundCard, borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  level: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
  vouches: { color: colors.textSecondary, fontSize: 13 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 8 },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 18, marginTop: 8 },
});
