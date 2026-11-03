import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt, tx } from '../../i18n/tt';
import { appendPrompt, checkBeforePublish, getDescriptionPrompts, getSafetyTips, getSuggestedHours } from '../../utils/favorHelp';

interface DescriptionPromptsProps {
  category: string;
  description: string;
  max: number;
  onChange: (next: string) => void;
}

/** Frasi da toccare sotto la descrizione ("Quando:", "Dove:"…) per scrivere un annuncio chiaro. */
export function DescriptionPrompts({ category, description, max, onChange }: DescriptionPromptsProps) {
  const prompts = getDescriptionPrompts(category).filter((prompt) => !description.includes(prompt.trim()));
  if (prompts.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipLabel}>{tt('Aiuta chi legge')}:</Text>
      {prompts.map((prompt) => (
        <TouchableOpacity
          key={prompt}
          style={styles.chip}
          onPress={() => onChange(appendPrompt(description, prompt, max))}
          accessibilityRole="button"
          accessibilityLabel={`${tt('Aggiungi')} ${prompt.replace(':', '').trim()}`}
        >
          <Ionicons name="add" size={14} color={colors.textPrimary} />
          <Text style={styles.chipText}>{prompt.replace(':', '').trim()}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface DurationSuggestionProps {
  category: string;
  hours: number;
  onAccept: (hours: number) => void;
}

/** "Di solito servono circa 2 ore": proposta di tempo per la categoria, con un tocco per accettarla. */
export function DurationSuggestion({ category, hours, onAccept }: DurationSuggestionProps) {
  const suggested = getSuggestedHours(category);
  if (!category || suggested === hours) return null;
  return (
    <View style={styles.suggestion}>
      <Ionicons name="time-outline" size={16} color={colors.lime} />
      <Text style={styles.suggestionText}>
        {tx('Per «{0}» di solito servono circa {1} {2}.', [tt(category), suggested, suggested === 1 ? tt('ora') : tt('ore')])}
      </Text>
      <TouchableOpacity
        style={styles.suggestionButton}
        onPress={() => onAccept(suggested)}
        accessibilityRole="button"
        accessibilityLabel={`${tt('Usa')} ${suggested} ${suggested === 1 ? tt('ora') : tt('ore')}`}
      >
        <Text style={styles.suggestionButtonText}>{tt('Usa')} {suggested}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Consigli di sicurezza brevi, scelti in base alla categoria. */
export function SafetyTips({ category }: { category: string }) {
  const tips = getSafetyTips(category);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.cardHeader}>
        <Ionicons name="shield-checkmark" size={18} color={colors.lime} />
        <Text style={styles.cardTitle}>{tt('Consigli di sicurezza')}</Text>
      </View>
      {tips.map((tip) => (
        <View key={tip} style={styles.tipRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

interface PrePublishCheckProps {
  title: string;
  description: string;
}

/** Promemoria prima di pubblicare: non blocca niente, ricorda cosa manca o cosa non scrivere nel testo. */
export function PrePublishCheck({ title, description }: PrePublishCheckProps) {
  const notes = checkBeforePublish(title, description);
  if (notes.length === 0) return null;
  return (
    <View style={[styles.card, styles.cardWarn]} accessibilityRole="alert">
      <View style={styles.cardHeader}>
        <Ionicons name="bulb" size={18} color={colors.accent} />
        <Text style={styles.cardTitle}>{tt('Prima di pubblicare')}</Text>
      </View>
      {notes.map((note) => (
        <View key={note.id} style={styles.tipRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.tipText}>{note.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  chipLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.backgroundLight,
  },
  suggestionText: { flex: 1, color: colors.textPrimary, fontSize: 13 },
  suggestionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent },
  suggestionButtonText: { color: colors.background, fontSize: 12, fontWeight: '800' },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardWarn: { borderColor: colors.accent, backgroundColor: 'rgba(248, 120, 40, 0.12)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  tipRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.textPrimary, fontSize: 14 },
  tipText: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
});
