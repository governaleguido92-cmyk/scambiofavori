import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { api } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { notify } from '../../utils/notify';

interface Props {
  userId: string;
  token: string;
  onVouched?: (vouchCount: number) => void;
}

const MIN_LEVEL_TO_VOUCH = 2;

/**
 * Nel profilo di un vicino: «Lo conosco di persona». Chi ha già 3 favori completati può garantire per lui;
 * gli altri vedono il pulsante spento e quanti favori mancano, così non lo toccano per niente.
 */
export function VouchBox({ userId, token, onVouched }: Props) {
  const [canVouch, setCanVouch] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<number>(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getMyTrust(token)
      .then((mine) => { setCanVouch(mine.trust_level >= MIN_LEVEL_TO_VOUCH); setMissing(mine.favors_to_next_level ?? 0); })
      .catch(() => setCanVouch(null));
  }, [token]);

  if (canVouch === null) return null;

  const vouch = async () => {
    setBusy(true);
    try {
      const result = await api.vouchForUser(userId, token);
      setDone(true);
      onVouched?.(result.vouch_count);
      notify(tt('Grazie!'), result.message);
    } catch (error: any) {
      notify(tt('Errore'), error?.message || tt('Impossibile garantire per questo vicino'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box} data-testid="vouch-box">
      <Text style={styles.title}>{tt('Lo conosci di persona?')}</Text>
      <Text style={styles.text}>
        {canVouch
          ? tt('Se lo conosci davvero, puoi garantire per lui: aiuta gli altri vicini a fidarsi.')
          : tx('Potrai garantire per un vicino dopo 3 favori completati: te ne mancano {0}.', [missing])}
      </Text>
      <TouchableOpacity
        style={[styles.button, (!canVouch || done) && styles.buttonOff]}
        onPress={vouch}
        disabled={!canVouch || done || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canVouch || done }}
        data-testid="vouch-button"
      >
        <Ionicons name={done ? 'checkmark' : canVouch ? 'people' : 'lock-closed'} size={14} color={canVouch && !done ? colors.background : colors.textMuted} />
        <Text style={[styles.buttonText, (!canVouch || done) && styles.buttonTextOff]}>
          {done ? tt('Garanzia data') : tt('Lo conosco di persona')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  text: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  button: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent },
  buttonOff: { backgroundColor: colors.backgroundLight },
  buttonText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  buttonTextOff: { color: colors.textMuted },
});
