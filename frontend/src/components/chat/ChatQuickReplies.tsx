import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';

export interface QuickReply {
  /** Testo in italiano (sorgente delle traduzioni). */
  text: string;
  /** true: lo scrive nel campo da completare ("Ci vediamo alle ..."); false: lo invia subito. */
  prefill: boolean;
}

export const QUICK_REPLIES: ReadonlyArray<QuickReply> = [
  { text: 'Sono arrivato', prefill: false },
  { text: 'Arrivo tra 10 minuti', prefill: false },
  { text: 'Ci vediamo alle ', prefill: true },
  { text: 'Grazie mille!', prefill: false },
];

interface ChatQuickRepliesProps {
  disabled?: boolean;
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}

/** Risposte rapide sopra la tastiera: servono a coordinarsi senza scrivere. */
export function ChatQuickReplies({ disabled, onSend, onPrefill }: ChatQuickRepliesProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {QUICK_REPLIES.map((reply) => {
        const text = tt(reply.text);
        return (
          <TouchableOpacity
            key={reply.text}
            style={[styles.chip, disabled && styles.chipDisabled]}
            disabled={disabled}
            onPress={() => (reply.prefill ? onPrefill(text) : onSend(text))}
            accessibilityRole="button"
            accessibilityLabel={text.trim()}
          >
            <Text style={styles.chipText}>{text.trim()}{reply.prefill ? '…' : ''}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
