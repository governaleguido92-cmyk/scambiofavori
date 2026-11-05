import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, NeighborhoodIntro, ThanksEntry } from '../../services/api';
import colors from '../../theme/colors';
import { tt, tx } from '../../i18n/tt';
import { notify, showRefusal } from '../../utils/notify';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { GranelloIcon } from '../GranelloIcon';

const INTRO_MAX = 200;
const THANKS_LIMIT = 10;

function ageLabel(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hours < 1) return tt('adesso');
  if (hours < 24) return tx('{0} h fa', [hours]);
  return tx('{0} g fa', [Math.floor(hours / 24)]);
}

/** "Vicini": presentazioni dei nuovi arrivati (con "Benvenuto") e bacheca dei Grazie. */
export function NeighborsTab({ token }: { token: string | null }) {
  const [intros, setIntros] = useState<NeighborhoodIntro[]>([]);
  const [thanks, setThanks] = useState<ThanksEntry[]>([]);
  const [noPosition, setNoPosition] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [introResult, thanksResult] = await Promise.all([api.getNeighborhoodIntros(token), api.getThanksBoard(THANKS_LIMIT)]);
      setIntros(introResult.intros);
      setNoPosition(introResult.reason === 'no_position');
      setThanks(thanksResult);
    } catch {
      // Un errore di rete si riprova al prossimo giro
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load])
  );
  useLiveRefresh(load);

  const myIntro = intros.find((i) => i.mine);

  const publish = async () => {
    const content = text.trim();
    if (!token || !content || sending) return;
    setSending(true);
    try {
      await api.writeNeighborhoodIntro(content, token);
      setText('');
      setComposerOpen(false);
      await load();
    } catch (error: any) {
      showRefusal(tt('Presentazione non pubblicata'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    } finally {
      setSending(false);
    }
  };

  const toggleWelcome = async (intro: NeighborhoodIntro) => {
    if (!token) return;
    try {
      const result = await api.welcomeNeighborhoodIntro(intro.intro_id, token);
      setIntros((current) => current.map((i) =>
        i.intro_id === intro.intro_id ? { ...i, welcomed: result.welcomed, welcomes: i.welcomes + (result.welcomed ? 1 : -1) } : i
      ));
    } catch (error: any) {
      showRefusal(tt('Errore'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    }
  };

  const openMenu = (intro: NeighborhoodIntro) => {
    if (!token) return;
    const buttons = intro.mine
      ? [
          { text: tt('Annulla'), style: 'cancel' as const },
          {
            text: tt('Ritira la mia presentazione'),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.withdrawNeighborhoodIntro(token);
                load();
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile ritirare'), tt('Ho capito'));
              }
            },
          },
        ]
      : [
          { text: tt('Annulla'), style: 'cancel' as const },
          {
            text: tt('Segnala la presentazione'),
            onPress: async () => {
              try {
                const result = await api.reportNeighborhoodIntro(intro.intro_id, token);
                notify(tt('Segnalazione inviata'), result.message);
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile segnalare'), tt('Ho capito'));
              }
            },
          },
          {
            text: tx('Blocca {0}', [intro.author_name]),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.blockUser(intro.author_id, undefined, token);
                notify(tt('Utente bloccato'), intro.author_name);
                load();
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile bloccare l\'utente'), tt('Ho capito'));
              }
            },
          },
        ];
    Alert.alert(intro.author_name, intro.text, buttons);
  };

  if (loading) return <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />;

  return (
    <View style={styles.container} data-testid="neighborhood-neighbors">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{tt('Nuovi vicini')}</Text>
        {noPosition && (
          <Text style={styles.hint}>{tt('Non conosco la tua zona: pubblica o accetta un favore, oppure imposta la posizione nel profilo.')}</Text>
        )}
        {intros.map((intro) => (
          <View key={intro.intro_id} style={styles.card}>
            <TouchableOpacity onPress={() => openMenu(intro)} activeOpacity={0.8} style={styles.cardMain}>
              <Text style={styles.emoji}>👋</Text>
              <View style={styles.body}>
                <Text style={styles.name}>{intro.mine ? tt('La tua presentazione') : intro.author_name}</Text>
                <Text style={styles.text}>{intro.text}</Text>
                <Text style={styles.meta}>
                  {intro.distance_km ? `${tx('circa {0} km', [intro.distance_km])}  ·  ` : ''}{ageLabel(intro.created_at)}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.footer}>
              <Text style={styles.count}>{tx('{0} benvenuti', [intro.welcomes])}</Text>
              {!intro.mine && (
                <TouchableOpacity
                  style={[styles.welcomeButton, intro.welcomed && styles.welcomeButtonOn]}
                  onPress={() => toggleWelcome(intro)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: intro.welcomed }}
                  data-testid={`welcome-${intro.intro_id}`}
                >
                  <Text style={styles.welcomeText}>{intro.welcomed ? tt('Benvenuto! ✓') : tt('Dai il benvenuto')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {intros.length === 0 && !noPosition && (
          <Text style={styles.emptyLine}>{tt('Nessuno si è presentato di recente. Sei nuovo in zona? Presentati tu!')}</Text>
        )}
        <TouchableOpacity style={styles.introButton} onPress={() => setComposerOpen(true)} accessibilityRole="button" data-testid="write-intro">
          <Ionicons name="hand-right-outline" size={18} color={colors.background} />
          <Text style={styles.introButtonText}>{myIntro ? tt('Cambia la mia presentazione') : tt('Presentati al quartiere')}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>{tt('Grazie dei vicini')}</Text>
        {thanks.map((entry) => (
          <View key={entry.thanks_id} style={styles.thanksCard}>
            <GranelloIcon size={20} />
            <View style={styles.body}>
              <Text style={styles.thanksText}>{entry.message}</Text>
              <Text style={styles.meta}>{tx('{0} dice grazie a {1}', [entry.giver_name, entry.receiver_name])}  ·  {ageLabel(entry.created_at)}</Text>
            </View>
          </View>
        ))}
        {thanks.length === 0 && (
          <Text style={styles.emptyLine}>{tt('I ringraziamenti dopo un favore compariranno qui.')}</Text>
        )}
      </ScrollView>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{tt('Presentati ai tuoi vicini')}</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={tt('Es. Sono Marco, mi sono trasferito da poco. So fare piccoli lavori e adoro il mare.')}
              placeholderTextColor={colors.textMuted}
              maxLength={INTRO_MAX}
              multiline
              data-testid="intro-input"
            />
            <Text style={styles.counter}>{text.length}/{INTRO_MAX}  ·  {tt('Resta 14 giorni. Niente telefono, email, link o soldi.')}</Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setComposerOpen(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.publish, (!text.trim() || sending) && styles.publishDisabled]} onPress={publish} disabled={!text.trim() || sending} accessibilityRole="button" data-testid="intro-submit">
                {sending ? <ActivityIndicator color={colors.background} /> : <Text style={styles.publishText}>{tt('Pubblica')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 40 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  sectionSpaced: { marginTop: 16 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.backgroundCard, borderRadius: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', gap: 12, padding: 12 },
  emoji: { fontSize: 26 },
  body: { flex: 1, gap: 2 },
  name: { color: colors.lime, fontSize: 13, fontWeight: '700' },
  text: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 20 },
  meta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12 },
  count: { color: colors.textSecondary, fontSize: 13 },
  welcomeButton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, opacity: 0.85 },
  welcomeButtonOn: { backgroundColor: colors.lime, opacity: 1 },
  welcomeText: { color: colors.background, fontSize: 13.5, fontWeight: '800' },
  emptyLine: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  introButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 },
  introButtonText: { color: colors.background, fontSize: 14.5, fontWeight: '800' },
  thanksCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 12 },
  thanksText: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  input: { minHeight: 90, borderRadius: 12, backgroundColor: colors.backgroundCard, color: colors.textPrimary, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 12 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  cancelText: { color: colors.textPrimary, fontWeight: '700' },
  publish: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent },
  publishDisabled: { opacity: 0.85 },
  publishText: { color: colors.background, fontWeight: '800' },
});
