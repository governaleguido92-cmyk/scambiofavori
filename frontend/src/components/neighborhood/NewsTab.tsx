import { PlacePicker } from './PlacePicker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, NeighborhoodNotice } from '../../services/api';
import colors from '../../theme/colors';
import { tt, tx } from '../../i18n/tt';
import { notify, showRefusal } from '../../utils/notify';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const NOTICE_MAX = 200;

export const NOTICE_CATEGORIES: ReadonlyArray<{ key: string; emoji: string; label: string }> = [
  { key: 'lavori', emoji: '🚧', label: 'Lavori e strade' },
  { key: 'smarrito', emoji: '🔎', label: 'Smarrito e trovato' },
  { key: 'evento', emoji: '🎉', label: 'Eventi' },
  { key: 'sicurezza', emoji: '🛡️', label: 'Sicurezza' },
  { key: 'altro', emoji: '📌', label: 'Altro' },
];

function ageLabel(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hours < 1) return tt('adesso');
  if (hours < 24) return tx('{0} h fa', [hours]);
  return tx('{0} g fa', [Math.floor(hours / 24)]);
}

/** Avvisi del quartiere: li pubblicano gli utenti con un favore attivo e durano 3 giorni. */
export function NewsTab({ token, composeSignal }: { token: string | null; composeSignal?: string }) {
  const router = useRouter();
  const [notices, setNotices] = useState<NeighborhoodNotice[]>([]);
  const [noPosition, setNoPosition] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  // Il tasto Crea può aprire direttamente la finestra di scrittura
  useEffect(() => {
    if (composeSignal) setComposerOpen(true);
  }, [composeSignal]);
  const [category, setCategory] = useState('lavori');
  const [text, setText] = useState('');
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getNeighborhoodNews(token);
      setNotices(result.notices);
      setNoPosition(result.reason === 'no_position');
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

  const publish = async () => {
    const content = text.trim();
    if (!token || !content || sending) return;
    setSending(true);
    try {
      await api.publishNotice(category, content, token);
      setText('');
      setComposerOpen(false);
      await load();
    } catch (error: any) {
      showRefusal(tt('Avviso non pubblicato'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    } finally {
      setSending(false);
    }
  };

  const openNotice = (notice: NeighborhoodNotice) => {
    if (!token) return;
    const profileButton = { text: tt('Vedi il profilo'), onPress: () => router.push(`/vicino/${notice.author_id}` as any) };
    const buttons = notice.mine
      ? [
          { text: tt('Annulla'), style: 'cancel' as const },
          {
            text: tt('Cancella il mio avviso'),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.deleteNotice(notice.notice_id, token);
                load();
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile cancellare'), tt('Ho capito'));
              }
            },
          },
        ]
      : [
          { text: tt('Annulla'), style: 'cancel' as const },
          profileButton,
          {
            text: tt('Segnala l\'avviso'),
            onPress: async () => {
              try {
                const result = await api.reportNotice(notice.notice_id, token);
                notify(tt('Segnalazione inviata'), result.message);
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile segnalare'), tt('Ho capito'));
              }
            },
          },
          {
            text: tx('Blocca {0}', [notice.author_name]),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.blockUser(notice.author_id, undefined, token);
                notify(tt('Utente bloccato'), notice.author_name);
                load();
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile bloccare l\'utente'), tt('Ho capito'));
              }
            },
          },
        ];
    Alert.alert(notice.author_name, notice.text, buttons);
  };

  if (loading) return <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />;

  const empty = notices.length === 0;

  return (
    <View style={styles.container} data-testid="neighborhood-news">
      <ScrollView contentContainerStyle={styles.content}>
        {noPosition && (
          <Text style={styles.hint}>{tt('Non conosco la tua zona: pubblica o accetta un favore per vedere gli avvisi vicino a te.')}</Text>
        )}

        {notices.map((notice) => {
          const info = NOTICE_CATEGORIES.find((c) => c.key === notice.category) || NOTICE_CATEGORIES[4];
          return (
            <TouchableOpacity key={notice.notice_id} style={styles.noticeCard} onPress={() => openNotice(notice)} activeOpacity={0.8}>
              <Text style={styles.noticeEmoji}>{info.emoji}</Text>
              <View style={styles.noticeBody}>
                <Text style={styles.noticeCategory}>{tt(info.label)}</Text>
                <Text style={styles.noticeText}>{notice.text}</Text>
                <Text style={styles.noticeMeta}>
                  {notice.mine ? tt('Tu') : notice.author_name}
                  {notice.distance_km ? `  ·  ${tx('circa {0} km', [notice.distance_km])}` : ''}  ·  {ageLabel(notice.created_at)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {empty && !noPosition && (
          <View style={styles.empty}>
            <Ionicons name="newspaper-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{tt('Nessun avviso per ora')}</Text>
            <Text style={styles.emptyText}>{tt('Gli avvisi dei vicini compariranno qui. Tocca un avviso per segnalarlo.')}</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setComposerOpen(true)} accessibilityRole="button" data-testid="publish-notice">
        <Ionicons name="add" size={22} color={colors.background} />
        <Text style={styles.fabText}>{tt('Pubblica un avviso')}</Text>
      </TouchableOpacity>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{tt('Pubblica un avviso per il quartiere')}</Text>
            <View style={styles.chips}>
              {NOTICE_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, category === c.key && styles.chipActive]}
                  onPress={() => setCategory(c.key)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, category === c.key && styles.chipTextActive]}>
                    {c.emoji} {tt(c.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={tt('Es. Strada chiusa in via Roma fino a sera')}
              placeholderTextColor={colors.textMuted}
              maxLength={NOTICE_MAX}
              multiline
              data-testid="notice-input"
            />
            <TouchableOpacity style={styles.placeButton} onPress={() => setPlacePickerOpen(true)} accessibilityRole="button" data-testid="notice-pick-place">
              <Ionicons name="location" size={16} color="#FFFFFF" />
              <Text style={styles.placeButtonText}>{tt('Aggiungi un luogo (entro 15 km)')}</Text>
            </TouchableOpacity>
            <Text style={styles.counter}>{text.length}/{NOTICE_MAX}  ·  {tt('Resta 3 giorni. Niente soldi, telefono, email o link.')}</Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setComposerOpen(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.publish, (!text.trim() || sending) && styles.publishDisabled]}
                onPress={publish}
                disabled={!text.trim() || sending}
                accessibilityRole="button"
                data-testid="notice-submit"
              >
                {sending ? <ActivityIndicator color={colors.background} /> : <Text style={styles.publishText}>{tt('Pubblica')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PlacePicker
        visible={placePickerOpen}
        token={token}
        onPick={(name) => setText((previous) => (previous.startsWith(`${name}:`) ? previous : `${name}: ${previous}`).slice(0, NOTICE_MAX))}
        onClose={() => setPlacePickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 40 },
  content: { paddingHorizontal: 16, paddingBottom: 90, gap: 10 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  noticeCard: { flexDirection: 'row', gap: 12, backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 12 },
  noticeEmoji: { fontSize: 24 },
  noticeBody: { flex: 1, gap: 2 },
  noticeCategory: { color: colors.lime, fontSize: 12, fontWeight: '700' },
  noticeText: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 20 },
  noticeMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 24 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  placeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.backgroundCard, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  placeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  fabText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.backgroundCard },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textPrimary, fontSize: 13 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  input: { minHeight: 90, borderRadius: 12, backgroundColor: colors.backgroundCard, color: colors.textPrimary, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 12 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  cancelText: { color: colors.textPrimary, fontWeight: '700' },
  publish: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent },
  publishDisabled: { opacity: 0.85 },
  publishText: { color: '#FFFFFF', fontWeight: '800' },
});
