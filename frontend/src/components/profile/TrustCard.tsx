import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { api, TrustStatus } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { newUserHint, trustLevelLabel } from '../../utils/trustLevels';

const FAVORS_FOR_LEVEL_TWO = 3;

/** Nel proprio profilo: livello di fiducia, garanzie ricevute e limiti dei nuovi utenti. */
export function TrustCard({ token }: { token: string }) {
  const [trust, setTrust] = useState<TrustStatus | null>(null);

  useEffect(() => {
    api.getMyTrust(token).then(setTrust).catch(() => setTrust(null));
  }, [token]);

  if (!trust) return null;
  const hint = newUserHint(trust.favors_to_next_level, trust.max_open_favors, trust.max_hours);
  const remaining = trust.favors_to_next_level;
  const showProgress = trust.is_new_user && remaining !== null && remaining > 0;
  const done = Math.max(0, FAVORS_FOR_LEVEL_TWO - (remaining ?? 0));

  return (
    <View style={styles.card} data-testid="trust-card">
      <View style={styles.row}>
        <Ionicons name="shield-checkmark" size={18} color={colors.lime} />
        <Text style={styles.level}>{trustLevelLabel(trust.trust_level)}</Text>
        {trust.vouch_count > 0 && (
          <Text style={styles.vouches}>{tx('{0} garanzie', [trust.vouch_count])}</Text>
        )}
      </View>
      {showProgress && (
        <View style={styles.progressWrap} accessibilityLabel={tx('{0} favori su {1} per sbloccare tutto', [done, FAVORS_FOR_LEVEL_TWO])}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (done / FAVORS_FOR_LEVEL_TWO) * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{tx('{0} favori su {1} per sbloccare tutto', [done, FAVORS_FOR_LEVEL_TWO])}</Text>
        </View>
      )}
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
  progressWrap: { marginTop: 10, gap: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.backgroundLight, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  progressText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 18, marginTop: 8 },
});
