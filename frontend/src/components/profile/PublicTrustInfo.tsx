import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { api, Reputation } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { notify } from '../../utils/notify';
import { cancelRateLabel, trustLevelLabel } from '../../utils/trustLevels';

interface Props {
  userId: string;
  currentUserId?: string;
  token: string;
  trustLevel: number;
  vouchCount: number;
}

const MIN_LEVEL_TO_VOUCH = 2;

/** Nel profilo di un altro vicino: livello, garanzie, affidabilità e il pulsante "Lo conosco di persona". */
export function PublicTrustInfo({ userId, currentUserId, token, trustLevel, vouchCount }: Props) {
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [canVouch, setCanVouch] = useState(false);
  const [vouches, setVouches] = useState(vouchCount);
  const [vouched, setVouched] = useState(false);
  const isSelf = userId === currentUserId;

  useEffect(() => {
    api.getReputation(userId, token).then(setReputation).catch(() => setReputation(null));
    if (!isSelf) {
      api.getMyTrust(token).then((mine) => setCanVouch(mine.trust_level >= MIN_LEVEL_TO_VOUCH)).catch(() => setCanVouch(false));
    }
  }, [userId, token, isSelf]);

  const handleVouch = async () => {
    try {
      const result = await api.vouchForUser(userId, token);
      setVouches(result.vouch_count);
      setVouched(true);
      notify(tt('Grazie!'), result.message);
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile garantire per questo vicino'));
    }
  };

  const cancelLabel = reputation ? cancelRateLabel(reputation.cancel_rate, reputation.late_cancellations) : '';

  return (
    <View style={styles.box} data-testid="public-trust-info">
      <View style={styles.row}>
        <Ionicons name="shield-checkmark" size={16} color={colors.lime} />
        <Text style={styles.level}>{trustLevelLabel(trustLevel)}</Text>
      </View>
      {vouches > 0 && <Text style={styles.line}>{tx('Garantito da {0} vicini che lo conoscono', [vouches])}</Text>}
      {reputation && reputation.completed > 0 && (
        <Text style={styles.line}>{tx('{0} favori completati', [reputation.completed])}</Text>
      )}
      {cancelLabel ? <Text style={styles.line}>{cancelLabel}</Text> : null}
      {!isSelf && canVouch && !vouched && (
        <TouchableOpacity style={styles.button} onPress={handleVouch} accessibilityRole="button" data-testid="vouch-button">
          <Text style={styles.buttonText}>{tt('Lo conosco di persona')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  level: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  line: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  button: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent },
  buttonText: { color: colors.background, fontSize: 13, fontWeight: '800' },
});
