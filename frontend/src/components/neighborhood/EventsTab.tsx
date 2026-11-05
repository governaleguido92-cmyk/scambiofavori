import { PlacePicker } from './PlacePicker';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, NeighborhoodEvent } from '../../services/api';
import colors from '../../theme/colors';
import { tt, tx } from '../../i18n/tt';
import { notify, showRefusal } from '../../utils/notify';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { buildStart, dayLabel, EVENT_DAY_OPTIONS, EVENT_HOUR_OPTIONS, formatEventStart, hourLabel } from '../../utils/eventTime';

const TITLE_MAX = 60;
const PLACE_MAX = 60;
const DESCRIPTION_MAX = 200;

const KINDS: ReadonlyArray<{ key: 'evento' | 'ritrovo'; emoji: string; label: string; hint: string }> = [
  { key: 'evento', emoji: '🎉', label: 'Evento', hint: 'Una sagra, una pulizia, un torneo' },
  { key: 'ritrovo', emoji: '☕', label: 'Ritrovo', hint: 'Un caffè, una passeggiata, quattro chiacchiere' },
];

/** Eventi e ritrovi del quartiere: si organizzano con un giorno e un'ora, i vicini rispondono "Ci vado". */
export function EventsTab({ token, composeSignal }: { token: string | null; composeSignal?: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<NeighborhoodEvent[]>([]);
  const [noPosition, setNoPosition] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  // Il tasto Crea può aprire direttamente la finestra di scrittura
  useEffect(() => {
    if (composeSignal) setComposerOpen(true);
  }, [composeSignal]);
  const [kind, setKind] = useState<'evento' | 'ritrovo'>('ritrovo');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [dayOffset, setDayOffset] = useState(1);
  const [hour, setHour] = useState(18);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getNeighborhoodEvents(token);
      setEvents(result.events);
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

  const canPublish = title.trim().length > 0 && place.trim().length > 0 && !sending;

  const publish = async () => {
    if (!token || !canPublish) return;
    setSending(true);
    try {
      await api.createNeighborhoodEvent(
        { kind, title: title.trim(), description: description.trim(), place: place.trim(), starts_at: buildStart(dayOffset, hour) },
        token
      );
      setTitle('');
      setPlace('');
      setDescription('');
      setComposerOpen(false);
      await load();
    } catch (error: any) {
      showRefusal(tt('Evento non pubblicato'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    } finally {
      setSending(false);
    }
  };

  const toggleGoing = async (event: NeighborhoodEvent) => {
    if (!token) return;
    try {
      const result = await api.joinNeighborhoodEvent(event.event_id, token);
      setEvents((current) => current.map((e) =>
        e.event_id === event.event_id ? { ...e, going: result.going, attendees: e.attendees + (result.going ? 1 : -1) } : e
      ));
    } catch (error: any) {
      showRefusal(tt('Errore'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    }
  };

  const openMenu = (event: NeighborhoodEvent) => {
    if (!token) return;
    const profileButton = { text: tt('Vedi il profilo'), onPress: () => router.push(`/vicino/${event.author_id}` as any) };
    const buttons = event.mine
      ? [
          { text: tt('Annulla'), style: 'cancel' as const },
          {
            text: tt('Cancella il mio evento'),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.deleteNeighborhoodEvent(event.event_id, token);
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
            text: tt('Segnala l\'evento'),
            onPress: async () => {
              try {
                const result = await api.reportNeighborhoodEvent(event.event_id, token);
                notify(tt('Segnalazione inviata'), result.message);
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile segnalare'), tt('Ho capito'));
              }
            },
          },
          {
            text: tx('Blocca {0}', [event.author_name]),
            style: 'destructive' as const,
            onPress: async () => {
              try {
                await api.blockUser(event.author_id, undefined, token);
                notify(tt('Utente bloccato'), event.author_name);
                load();
              } catch (error: any) {
                showRefusal(tt('Errore'), error?.message || tt('Impossibile bloccare l\'utente'), tt('Ho capito'));
              }
            },
          },
        ];
    Alert.alert(event.title, event.description || event.place, buttons);
  };

  if (loading) return <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />;

  return (
    <View style={styles.container} data-testid="neighborhood-events">
      <ScrollView contentContainerStyle={styles.content}>
        {noPosition && (
          <Text style={styles.hint}>{tt('Non conosco la tua zona: pubblica o accetta un favore per vedere gli eventi vicino a te.')}</Text>
        )}

        {events.map((event) => {
          const info = KINDS.find((k) => k.key === event.kind) || KINDS[0];
          return (
            <View key={event.event_id} style={styles.card}>
              <TouchableOpacity onPress={() => openMenu(event)} activeOpacity={0.8} style={styles.cardMain}>
                <Text style={styles.emoji}>{info.emoji}</Text>
                <View style={styles.body}>
                  <Text style={styles.kind}>{tt(info.label)}  ·  {formatEventStart(event.starts_at)}</Text>
                  <Text style={styles.title}>{event.title}</Text>
                  <Text style={styles.place}><Ionicons name="location-outline" size={13} color={colors.textMuted} /> {event.place}</Text>
                  {!!event.description && <Text style={styles.description}>{event.description}</Text>}
                  <Text style={styles.meta}>
                    {event.mine ? tt('Lo organizzi tu') : tx('Organizza {0}', [event.author_name])}
                    {event.distance_km ? `  ·  ${tx('circa {0} km', [event.distance_km])}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.footer}>
                <Text style={styles.count}>{tx('{0} partecipanti', [event.attendees])}</Text>
                {!event.mine && (
                  <TouchableOpacity
                    style={[styles.goButton, event.going && styles.goButtonOn]}
                    onPress={() => toggleGoing(event)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: event.going }}
                    data-testid={`event-go-${event.event_id}`}
                  >
                    <Ionicons name={event.going ? 'checkmark-circle' : 'add-circle-outline'} size={16} color={colors.background} />
                    <Text style={[styles.goText, event.going && styles.goTextOn]}>{event.going ? tt('Ci vado!') : tt('Ci vado')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {events.length === 0 && !noPosition && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{tt('Nessun evento in programma')}</Text>
            <Text style={styles.emptyText}>{tt('Organizza un caffè, una passeggiata o un\'iniziativa: i vicini rispondono con "Ci vado".')}</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setComposerOpen(true)} accessibilityRole="button" data-testid="create-event">
        <Ionicons name="add" size={22} color={colors.background} />
        <Text style={styles.fabText}>{tt('Organizza')}</Text>
      </TouchableOpacity>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.backdrop}>
          <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>{tt('Organizza per il quartiere')}</Text>
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <TouchableOpacity key={k.key} style={[styles.chip, kind === k.key && styles.chipActive]} onPress={() => setKind(k.key)} accessibilityRole="button">
                  <Text style={[styles.chipText, kind === k.key && styles.chipTextActive]}>{k.emoji} {tt(k.label)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sheetHint}>{tt(KINDS.find((k) => k.key === kind)!.hint)}</Text>

            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={tt('Titolo (es. Caffè in piazza)')} placeholderTextColor={colors.textMuted} maxLength={TITLE_MAX} data-testid="event-title" />
            <TextInput style={styles.input} value={place} onChangeText={setPlace} placeholder={tt('Dove (es. Piazza principale, zona porto)')} placeholderTextColor={colors.textMuted} maxLength={PLACE_MAX} data-testid="event-place" />
            <TouchableOpacity style={styles.placeButton} onPress={() => setPlacePickerOpen(true)} accessibilityRole="button" data-testid="event-pick-place">
              <Ionicons name="location" size={16} color="#FFFFFF" />
              <Text style={styles.placeButtonText}>{tt('Scegli un luogo vicino (entro 20 km)')}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>{tt('Quando')}</Text>
            <View style={styles.chips}>
              {EVENT_DAY_OPTIONS.map((d) => (
                <TouchableOpacity key={d.offset} style={[styles.chip, dayOffset === d.offset && styles.chipActive]} onPress={() => setDayOffset(d.offset)} accessibilityRole="button">
                  <Text style={[styles.chipText, dayOffset === d.offset && styles.chipTextActive]}>{tt(dayLabel(d.offset))}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chips}>
              {EVENT_HOUR_OPTIONS.map((h) => (
                <TouchableOpacity key={h} style={[styles.chip, hour === h && styles.chipActive]} onPress={() => setHour(h)} accessibilityRole="button">
                  <Text style={[styles.chipText, hour === h && styles.chipTextActive]}>{hourLabel(h)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput style={[styles.input, styles.inputBig]} value={description} onChangeText={setDescription} placeholder={tt('Dettagli (facoltativo)')} placeholderTextColor={colors.textMuted} maxLength={DESCRIPTION_MAX} multiline />
            <Text style={styles.counter}>{tt('Niente soldi, telefono, email o link. Ci si incontra di persona, in luoghi pubblici.')}</Text>

            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setComposerOpen(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.publish, !canPublish && styles.publishDisabled]} onPress={publish} disabled={!canPublish} accessibilityRole="button" data-testid="event-submit">
                {sending ? <ActivityIndicator color={colors.background} /> : <Text style={styles.publishText}>{tt('Pubblica')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <PlacePicker visible={placePickerOpen} token={token} onPick={(name) => setPlace(name.slice(0, PLACE_MAX))} onClose={() => setPlacePickerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 40 },
  content: { paddingHorizontal: 16, paddingBottom: 90, gap: 10 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.backgroundCard, borderRadius: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', gap: 12, padding: 12 },
  emoji: { fontSize: 26 },
  body: { flex: 1, gap: 2 },
  kind: { color: colors.lime, fontSize: 12, fontWeight: '700' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  place: { color: colors.textSecondary, fontSize: 13.5 },
  placeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.backgroundCard, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  placeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  description: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12 },
  count: { color: colors.textSecondary, fontSize: 13 },
  goButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, opacity: 0.85 },
  goButtonOn: { backgroundColor: colors.lime, opacity: 1 },
  goText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  // sul verde oliva (già «Ci vado!») il testo scuro si legge meglio del bianco
  goTextOn: { color: colors.background },
  empty: { alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 24 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  fabText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  sheetContent: { padding: 18, gap: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  sheetHint: { color: colors.textSecondary, fontSize: 13 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.backgroundCard },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textPrimary, fontSize: 13 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  input: { borderRadius: 12, backgroundColor: colors.backgroundCard, color: colors.textPrimary, padding: 12, fontSize: 15 },
  inputBig: { minHeight: 70, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 12 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  cancelText: { color: colors.textPrimary, fontWeight: '700' },
  publish: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent },
  publishDisabled: { opacity: 0.85 },
  publishText: { color: '#FFFFFF', fontWeight: '800' },
});
