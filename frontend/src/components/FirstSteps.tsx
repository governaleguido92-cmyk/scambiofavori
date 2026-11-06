import React, { useEffect, useState } from 'react';
import { Share, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '../theme/colors';
import { api } from '../services/api';
import { tt, tx } from '../i18n/tt';
import { logger } from '../utils/logger';

const SITE_URL = 'https://scambiofavori.it';

interface FirstStepsProps {
  token: string;
  /** Favori aiutati: il terzo passo si spunta con il primo. */
  helped: number;
  /** Porta la Home sulla scheda «Dona un favore». */
  onShowGive: () => void;
}

interface Step {
  key: string;
  label: string;
  done: boolean;
  onPress: () => void;
}

/** Per chi è appena arrivato: quattro passi semplici. Sparisce da sola quando sono tutti fatti o non si è più nuovi. */
export function FirstSteps({ token, helped, onShowGive }: FirstStepsProps) {
  const router = useRouter();
  const [state, setState] = useState<{ isNew: boolean; published: boolean; introduced: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.getMyTrust(token),
      api.getMyFavors(token).catch(() => []),
      api.getNeighborhoodIntros(token).catch(() => ({ intros: [] })),
    ]).then(([trust, mine, intros]) => {
      if (!alive) return;
      setState({
        isNew: trust.is_new_user,
        published: mine.some((favor) => favor.status !== 'cancelled'),
        introduced: intros.intros.some((intro) => intro.mine),
      });
    }).catch(() => alive && setState(null));
    return () => { alive = false; };
  }, [token, helped]);

  if (!state || !state.isNew) return null;

  const invite = async () => {
    try {
      const info = await api.getReferralCode(token);
      await Share.share({
        message: tx(
          "Unisciti a Scambio Favori, l'app per scambiarsi favori tra vicini! Usa il mio codice {0} quando ti registri e parti con dei Granelli in più. {1}",
          [info.referral_code, SITE_URL]
        ),
      });
    } catch (error) {
      logger.debug('Error sharing invite:', error);
    }
  };

  const steps: Step[] = [
    { key: 'publish', label: tt('Pubblica il tuo primo favore'), done: state.published, onPress: () => router.push('/create' as any) },
    { key: 'intro', label: tt('Presentati al quartiere'), done: state.introduced, onPress: () => router.push('/quartiere?tab=vicini&compose=1' as any) },
    { key: 'help', label: tt('Aiuta un vicino e guadagna Granelli'), done: helped > 0, onPress: onShowGive },
    { key: 'invite', label: tt('Invita un vicino'), done: false, onPress: invite },
  ];
  const completed = steps.filter((step) => step.done).length;
  if (steps.slice(0, 3).every((step) => step.done)) return null;

  return (
    <View style={styles.card} data-testid="first-steps">
      <View style={styles.head}>
        <Text style={styles.title}>{tt('Comincia da qui')}</Text>
        <Text style={styles.count}>{completed}/{steps.length}</Text>
      </View>
      <Text style={styles.sub}>{tt('Inizi con 3 Granelli di benvenuto: servono per ricevere aiuto, e li guadagni aiutando.')}</Text>
      {steps.map((step) => (
        <TouchableOpacity key={step.key} style={styles.row} onPress={step.onPress} accessibilityRole="button" accessibilityState={{ checked: step.done }}>
          <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={step.done ? colors.lime : colors.textMuted} />
          <Text style={[styles.label, step.done && styles.labelDone]}>{step.label}</Text>
          {!step.done && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  count: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  sub: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  label: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '500' },
  labelDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
