import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';
import i18n from '../../i18n';
import { PLACE_MAX, WHEN_MAX } from '../../utils/meetingPoint';
import { PLACE_CATEGORIES, emojiForCategory, formatPlaceDistance, placeLabel } from '../../utils/placeCategories';
import { usePlaceSearch } from '../../hooks/usePlaceSearch';
import type { PlaceSuggestion } from '../../services/api';

const WHEN_CHOICES: readonly string[] = ['Adesso', 'Oggi alle ', 'Domani alle '];
const MIN_SEARCH_LENGTH = 3;
const SEARCH_DELAY_MS = 450;
const MAX_SUGGESTIONS = 8;

interface MeetingPointModalProps {
  visible: boolean;
  sending: boolean;
  /** Motivo per cui l'ultimo invio non è andato a buon fine (per esempio un testo non consentito). */
  error: string | null;
  /** Il favore attorno al quale cercare i luoghi. */
  favorId: string;
  token: string | null;
  onClose: () => void;
  onSubmit: (place: string, when: string) => void;
}

/** Dove e quando vi incontrate: si scrive il luogo o lo si sceglie tra quelli veri vicino al favore. */
export function MeetingPointModal({ visible, sending, error, favorId, token, onClose, onSubmit }: MeetingPointModalProps) {
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const search = usePlaceSearch(favorId, token);
  const { clear, searchText } = search;
  // Dopo aver scelto un luogo dall'elenco il testo cambia da solo: non deve far partire un'altra ricerca.
  const skipNextSearch = useRef(false);
  const canSend = place.trim().length > 0 && !sending;

  useEffect(() => {
    if (!visible) {
      setPlace('');
      setWhen('');
      setActiveCategory(null);
      clear();
    }
  }, [visible, clear]);

  // Scrivendo almeno tre lettere, dopo una breve pausa si cercano i luoghi con quel nome
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const text = place.trim();
    if (!visible || text.length < MIN_SEARCH_LENGTH) return;
    setActiveCategory(null);
    const timer = setTimeout(() => searchText(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [place, visible, searchText]);

  const handlePlaceChange = (text: string) => {
    setPlace(text);
    if (text.trim().length < MIN_SEARCH_LENGTH) clear();
  };

  const handleCategory = (key: string) => {
    setActiveCategory(key);
    search.searchCategory(key);
  };

  const handlePick = (suggestion: PlaceSuggestion) => {
    const label = placeLabel(suggestion).slice(0, PLACE_MAX);
    // Il salto serve solo se il testo cambia davvero: se è uguale l'effetto non parte e il salto resterebbe in sospeso
    skipNextSearch.current = label !== place;
    setPlace(label);
    setActiveCategory(null);
    clear();
  };

  const handleSubmit = () => {
    if (canSend) onSubmit(place, when);
  };

  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  const showResults = search.places.length > 0;
  const showEmpty = search.searched && !search.loading && !search.error && search.places.length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{tt('Punto d\'incontro')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tt('Chiudi')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.tip}>
              <Ionicons name="shield-checkmark" size={16} color={colors.lime} />
              <Text style={styles.tipText}>{tt('Scegliete un luogo pubblico, per esempio un bar o una piazza. Meglio non a casa di qualcuno.')}</Text>
            </View>

            <Text style={styles.label}>{tt('Dove')}</Text>
            <TextInput
              style={styles.input}
              value={place}
              onChangeText={handlePlaceChange}
              placeholder={tt('Scrivi un nome o scegli qui sotto')}
              placeholderTextColor={colors.textMuted}
              maxLength={PLACE_MAX}
              autoFocus
              accessibilityLabel={tt('Dove')}
            />

            <Text style={styles.sublabel}>{tt('Cerca vicino a voi')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow} keyboardShouldPersistTaps="handled">
              {PLACE_CATEGORIES.map((category) => {
                const active = activeCategory === category.key;
                return (
                  <TouchableOpacity
                    key={category.key}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => handleCategory(category.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={tt(category.label)}
                  >
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{tt(category.label)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {search.loading && (
              <View style={styles.status} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={colors.lime} />
                <Text style={styles.statusText}>{tt('Cerco i luoghi vicino a voi… può volerci qualche secondo.')}</Text>
              </View>
            )}

            {search.error && (
              <View style={styles.status} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                <Text style={styles.statusText}>{search.error}</Text>
              </View>
            )}

            {showEmpty && (
              <View style={styles.status} accessibilityLiveRegion="polite">
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <Text style={styles.statusText}>{tt('Nessun luogo trovato qui vicino. Scrivi tu dove incontrarvi.')}</Text>
              </View>
            )}

            {showResults && (
              <View style={styles.results}>
                {search.places.slice(0, MAX_SUGGESTIONS).map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={styles.result}
                    onPress={() => handlePick(suggestion)}
                    accessibilityRole="button"
                    accessibilityLabel={`${suggestion.name}, ${formatPlaceDistance(suggestion.distance_m, locale)}`}
                  >
                    <Text style={styles.resultEmoji}>{emojiForCategory(suggestion.category)}</Text>
                    <View style={styles.resultText}>
                      <Text style={styles.resultName} numberOfLines={1}>{suggestion.name}</Text>
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {suggestion.street ? `${suggestion.street} · ` : ''}{tt('circa')} {formatPlaceDistance(suggestion.distance_m, locale)}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={colors.lime} />
                  </TouchableOpacity>
                ))}
                {search.attribution && <Text style={styles.attribution}>{search.attribution}</Text>}
              </View>
            )}

            <Text style={styles.label}>{tt('Quando (facoltativo)')}</Text>
            <View style={styles.chips}>
              {WHEN_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={choice}
                  style={styles.chip}
                  onPress={() => setWhen(tt(choice))}
                  accessibilityRole="button"
                  accessibilityLabel={tt(choice).trim()}
                >
                  <Text style={styles.chipText}>{tt(choice).trim()}{choice.endsWith(' ') ? '…' : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={when}
              onChangeText={setWhen}
              placeholder={tt('Es: oggi alle 18')}
              placeholderTextColor={colors.textMuted}
              maxLength={WHEN_MAX}
              accessibilityLabel={tt('Quando')}
            />

            {error && (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Ionicons name="warning" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.send, !canSend && styles.sendDisabled]}
            onPress={handleSubmit}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={tt('Invia il punto d\'incontro')}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.sendText}>{tt('Invia il punto d\'incontro')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  card: {
    maxHeight: '92%', borderRadius: 18, padding: 18, backgroundColor: colors.backgroundCard,
    borderWidth: 1, borderColor: colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  tip: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10,
    backgroundColor: colors.limeMuted, marginBottom: 14,
  },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  sublabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.backgroundLight, color: colors.textPrimary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
  },
  categoryRow: { gap: 8, paddingBottom: 10 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, backgroundColor: colors.backgroundLight, borderWidth: 1, borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  categoryEmoji: { fontSize: 15 },
  categoryText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: '#fff', fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 6 },
  statusText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  results: {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundLight,
    marginBottom: 14, overflow: 'hidden',
  },
  result: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultEmoji: { fontSize: 20 },
  resultText: { flex: 1 },
  resultName: { color: colors.textPrimary, fontSize: 14.5, fontWeight: '700' },
  resultMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  attribution: { color: colors.textMuted, fontSize: 10.5, padding: 8, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.backgroundLight, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 12,
    backgroundColor: 'rgba(255,82,82,0.12)', borderWidth: 1, borderColor: 'rgba(255,82,82,0.4)',
  },
  errorText: { flex: 1, color: '#FF8A8A', fontSize: 12.5, lineHeight: 17 },
  send: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10,
    paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
