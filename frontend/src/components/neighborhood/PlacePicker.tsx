import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { api, PlaceSuggestion } from '../../services/api';
import { tt } from '../../i18n/tt';
import { formatDistance } from '../../utils/favorVisual';
import { modalAnimation } from '../../utils/reducedMotion';

interface PlacePickerProps {
  visible: boolean;
  token: string | null;
  onPick: (placeName: string) => void;
  onClose: () => void;
}

const SEARCH_DELAY_MS = 450;
const MIN_QUERY_LENGTH = 2;
const RADIUS_KM = 20;

/** Categorie di luoghi da proporre: la chiave è quella del server, l'etichetta è quella che leggono i vicini. */
const CATEGORIES: ReadonlyArray<{ key: string; emoji: string; label: string }> = [
  { key: 'square', emoji: '🏛️', label: 'Piazza' },
  { key: 'bar', emoji: '☕', label: 'Bar' },
  { key: 'park', emoji: '🌳', label: 'Parco' },
  { key: 'beach', emoji: '🏖️', label: 'Spiaggia' },
  { key: 'harbour', emoji: '⚓', label: 'Porto' },
  { key: 'church', emoji: '⛪', label: 'Chiesa' },
  { key: 'station', emoji: '🚉', label: 'Stazione' },
];

/**
 * Scelta del luogo per eventi e avvisi: piazze, bar, parchi, spiagge e porti entro 15 km da te (dati OpenStreetMap),
 * da una categoria o cercando per nome. Resta sempre possibile scrivere il luogo a mano.
 */
export function PlacePicker({ visible, token, onPick, onClose }: PlacePickerProps) {
  const [category, setCategory] = useState<string | null>('square');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [attribution, setAttribution] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const text = query.trim();
  const searchable = category !== null || text.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!visible || !token) return undefined;
    if (!searchable) {
      setResults([]);
      setError(null);
      return undefined;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const response = await api.getNeighborhoodPlaces({ category: category ?? undefined, q: text || undefined }, token, controller.signal);
        if (controller.signal.aborted) return;
        setResults(response.places);
        setAttribution(response.attribution);
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(e instanceof Error ? e.message : tt('Non riesco a cercare i luoghi adesso: scrivi tu il luogo.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, text ? SEARCH_DELAY_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible, token, category, text, searchable]);

  const pick = (place: PlaceSuggestion) => {
    onPick(place.name);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType={modalAnimation()} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tt('Chiudi')}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{tt('Scegli un luogo')}</Text>
          <Text style={styles.hint}>{tt('Entro 15 km da te')}</Text>

          <View style={styles.chips}>
            {CATEGORIES.map((item) => {
              const active = category === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(active ? null : item.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  data-testid={`place-category-${item.key}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.emoji} {tt(item.label)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={tt('Cerca per nome (es. Bar Roma)')}
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              returnKeyType="search"
              data-testid="place-search"
            />
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
            {!loading && error && <Text style={styles.message}>{error}</Text>}
            {!loading && !error && searchable && results.length === 0 && (
              <Text style={styles.message}>{tt('Nessun luogo trovato: prova un\'altra categoria, cerca per nome o scrivilo tu.')}</Text>
            )}
            {!loading && !searchable && (
              <Text style={styles.message}>{tt('Scegli una categoria oppure scrivi almeno due lettere.')}</Text>
            )}
            {!loading && results.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.row}
                onPress={() => pick(place)}
                accessibilityRole="button"
                data-testid={`place-${place.id}`}
              >
                <Ionicons name="location" size={18} color={colors.accent} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {formatDistance(place.distance_m / 1000)}{place.street ? ` · ${place.street}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {results.length > 0 && !!attribution && <Text style={styles.attribution}>{attribution}</Text>}
          </ScrollView>

          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>{tt('Scrivo io il luogo')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { RADIUS_KM as PLACE_PICKER_RADIUS_KM };

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10, maxHeight: '85%' },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.white, opacity: 0.8, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.backgroundCard },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.white, fontSize: 13.5, fontWeight: '600' },
  chipTextActive: { color: colors.white, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.backgroundCard, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.white, paddingVertical: 11, fontSize: 15 },
  list: { flexGrow: 0, minHeight: 120 },
  spinner: { marginVertical: 24 },
  message: { color: colors.white, opacity: 0.85, fontSize: 14, lineHeight: 20, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowText: { flex: 1 },
  rowName: { color: colors.white, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: colors.white, opacity: 0.8, fontSize: 12.5, marginTop: 2 },
  attribution: { color: colors.white, opacity: 0.6, fontSize: 11, textAlign: 'center', paddingVertical: 6 },
  close: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  closeText: { color: colors.white, fontWeight: '700' },
});
