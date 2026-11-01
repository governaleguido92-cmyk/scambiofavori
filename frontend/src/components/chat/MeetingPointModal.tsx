import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';
import { PLACE_MAX, WHEN_MAX } from '../../utils/meetingPoint';

const WHEN_CHOICES: readonly string[] = ['Adesso', 'Oggi alle ', 'Domani alle '];

interface MeetingPointModalProps {
  visible: boolean;
  sending: boolean;
  /** Motivo per cui l'ultimo invio non è andato a buon fine (per esempio un testo non consentito). */
  error: string | null;
  onClose: () => void;
  onSubmit: (place: string, when: string) => void;
}

/** Dove e quando vi incontrate: il luogo lo scrive chi invia, l'orario è facoltativo. */
export function MeetingPointModal({ visible, sending, error, onClose, onSubmit }: MeetingPointModalProps) {
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState('');
  const canSend = place.trim().length > 0 && !sending;

  const handleSubmit = () => {
    if (canSend) onSubmit(place, when);
  };

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

          <View style={styles.tip}>
            <Ionicons name="shield-checkmark" size={16} color={colors.lime} />
            <Text style={styles.tipText}>{tt('Scegliete un luogo pubblico, per esempio un bar o una piazza. Meglio non a casa di qualcuno.')}</Text>
          </View>

          <Text style={styles.label}>{tt('Dove')}</Text>
          <TextInput
            style={styles.input}
            value={place}
            onChangeText={setPlace}
            placeholder={tt('Es: Bar Roma, davanti alla farmacia')}
            placeholderTextColor={colors.textMuted}
            maxLength={PLACE_MAX}
            autoFocus
            accessibilityLabel={tt('Dove')}
          />

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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 18, padding: 18, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  tip: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10,
    backgroundColor: colors.limeMuted, marginBottom: 14,
  },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.backgroundLight, color: colors.textPrimary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.backgroundLight, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 12,
    backgroundColor: 'rgba(255,82,82,0.12)', borderWidth: 1, borderColor: 'rgba(255,82,82,0.4)',
  },
  errorText: { flex: 1, color: '#FF8A8A', fontSize: 12.5, lineHeight: 17 },
  send: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
