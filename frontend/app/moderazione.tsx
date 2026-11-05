import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api, HeldUser, ModerationReport } from '../src/services/api';
import colors from '../src/theme/colors';
import { tt, tx } from '../src/i18n/tt';
import { notify, showRefusal } from '../src/utils/notify';
import { goBackOrHome } from '../src/utils/navigation';

const REASONS: Record<string, string> = {
  safety_alert: 'Allarme di sicurezza', offensive: 'Offensivo', spam: 'Spam', fraud: 'Truffa', inappropriate: 'Inappropriato',
  fake_profile: 'Profilo falso', money_request: 'Chiede soldi', other: 'Altro',
};
const HIDEABLE = ['Messaggio del quartiere', 'Avviso del quartiere', 'Evento del quartiere', 'Presentazione', 'Favore'];

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ReportCard({ report, token, onDone }: { report: ModerationReport; token: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: string) => {
    setBusy(true);
    try {
      await api.moderationAction(report.report_id, action, note.trim(), token);
      onDone();
    } catch (error: any) {
      showRefusal(tt('Errore'), error?.message || tt('Azione non riuscita'), tt('Ho capito'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRelease = () =>
    Alert.alert(tt('Sbloccare questo account?'), report.reported_user?.name || '', [
      { text: tt('Annulla'), style: 'cancel' },
      { text: tt('Sblocca'), onPress: () => run('release_user') },
    ]);

  const owner = report.reported_user;
  return (
    <View style={styles.card} data-testid={`mod-report-${report.report_id}`}>
      <View style={styles.badges}>
        {report.priority === 'high' && <Text style={[styles.badge, styles.badgeUrgent]}>{tt('URGENTE')}</Text>}
        <Text style={styles.badge}>{tt(REASONS[report.reason || ''] || report.reason || 'Non specificato')}</Text>
        {report.status !== 'pending' && <Text style={styles.badge}>{tx('gestita: {0}', [report.status])}</Text>}
        {owner?.safety_hold && <Text style={[styles.badge, styles.badgeHold]}>{tt('in revisione')}</Text>}
      </View>
      <Text style={styles.meta}>{report.target.kind} · {tx('segnalato da {0}', [report.reporter_name])} · {when(report.created_at)}</Text>
      <Text style={styles.quote}>{report.target.summary}</Text>
      {!!report.description && <Text style={styles.text}>{tt('Nota di chi ha segnalato: ')}{report.description}</Text>}
      {owner && (
        <Text style={styles.meta}>{tx('Persona coinvolta: {0} · segnalazioni totali: {1}', [owner.name, owner.reports_total])}</Text>
      )}
      {report.status === 'pending' && (
        <>
          <TextInput style={styles.note} value={note} onChangeText={setNote} placeholder={tt('Nota per te (facoltativa)')} placeholderTextColor={colors.textMuted} maxLength={500} multiline />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} disabled={busy} onPress={() => run('dismiss')} accessibilityRole="button">
              <Text style={styles.btnGhostText}>{tt('Archivia')}</Text>
            </TouchableOpacity>
            {HIDEABLE.includes(report.target.kind) && (
              <TouchableOpacity style={styles.btn} disabled={busy} onPress={() => run('hide_content')} accessibilityRole="button">
                <Text style={styles.btnText}>{tt('Nascondi il contenuto')}</Text>
              </TouchableOpacity>
            )}
            {owner && !owner.safety_hold && (
              <TouchableOpacity style={styles.btn} disabled={busy} onPress={() => run('hold_user')} accessibilityRole="button">
                <Text style={styles.btnText}>{tt('Metti in revisione l\'account')}</Text>
              </TouchableOpacity>
            )}
            {owner?.safety_hold && (
              <TouchableOpacity style={[styles.btn, styles.btnOlive]} disabled={busy} onPress={confirmRelease} accessibilityRole="button">
                <Text style={styles.btnText}>{tt('Sblocca l\'account')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

/** Moderazione: solo per gli account abilitati dal titolare. Le segnalazioni, con il contesto, e le azioni per gestirle. */
export default function ModerationScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<'reports' | 'held'>('reports');
  const [showHandled, setShowHandled] = useState(false);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [held, setHeld] = useState<HeldUser[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.getModerationMe(token);
      setAllowed(me.moderator);
      if (!me.moderator) return;
      if (tab === 'reports') setReports((await api.getModerationReports(token, showHandled)).reports);
      else setHeld((await api.getModerationHeldUsers(token)).users);
    } catch (error: any) {
      notify(tt('Errore'), error?.message || tt('Impossibile caricare'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, tab, showHandled]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      return undefined;
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOrHome(router)} accessibilityRole="button" accessibilityLabel={tt('Indietro')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{tt('Moderazione')}</Text>
      </View>

      {allowed === false ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{tt('Account non abilitato')}</Text>
          <Text style={styles.emptyText}>{tt('Questa sezione è solo per i moderatori abilitati dal titolare.')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {(['reports', 'held'] as const).map((key) => (
              <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
                <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{key === 'reports' ? tt('Segnalazioni') : tt('In revisione')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tab === 'reports' && (
            <View style={styles.switchRow}>
              <Text style={styles.meta}>{tt('Mostra anche quelle già gestite')}</Text>
              <Switch value={showHandled} onValueChange={setShowHandled} trackColor={{ true: colors.lime, false: colors.border }} thumbColor={colors.textPrimary} />
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
          ) : tab === 'reports' ? (
            <FlatList
              data={reports}
              keyExtractor={(r) => r.report_id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <ReportCard report={item} token={token!} onDone={load} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.lime} />}
              ListEmptyComponent={<Text style={styles.emptyText}>{tt('Nessuna segnalazione da gestire.')}</Text>}
            />
          ) : (
            <FlatList
              data={held}
              keyExtractor={(u) => u.user_id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.name}>{item.name || item.user_id}</Text>
                  <Text style={styles.meta}>{tx('Allarmi di sicurezza ricevuti: {0}', [item.alerts])}{item.held_at ? ` · ${tt('dal')} ${when(item.held_at)}` : ''}</Text>
                  <Text style={styles.meta}>{tt('Per sbloccarlo apri una sua segnalazione (con "Mostra anche quelle già gestite") e scegli "Sblocca l\'account".')}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{tt('Nessun account in revisione.')}</Text>}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999, backgroundColor: colors.backgroundCard },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.background, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  card: { backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 14, gap: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: colors.backgroundLight, color: colors.textSecondary, fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  badgeUrgent: { backgroundColor: colors.accent, color: colors.background },
  badgeHold: { backgroundColor: colors.primaryDark, color: colors.textPrimary },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  quote: { color: colors.textPrimary, fontSize: 15, lineHeight: 21, borderLeftWidth: 3, borderLeftColor: colors.lime, paddingLeft: 10 },
  text: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  note: { backgroundColor: colors.background, color: colors.textPrimary, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 44, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  btnText: { color: colors.background, fontSize: 13.5, fontWeight: '800' },
  btnGhost: { backgroundColor: colors.backgroundLight },
  btnGhostText: { color: colors.textPrimary, fontSize: 13.5, fontWeight: '800' },
  btnOlive: { backgroundColor: colors.lime },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 20 },
});
