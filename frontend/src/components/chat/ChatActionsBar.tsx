import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';

interface ChatActionsBarProps {
  sendingLocation: boolean;
  disabled?: boolean;
  onMeetingPoint: () => void;
  onLocation: () => void;
}

/** Due azioni con il testo, al posto della sola puntina: punto d'incontro e posizione attuale. */
export function ChatActionsBar({ sendingLocation, disabled, onMeetingPoint, onLocation }: ChatActionsBarProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.disabled]}
        onPress={onMeetingPoint}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={tt('Punto d\'incontro')}
      >
        <Ionicons name="people" size={16} color={colors.lime} />
        <Text style={styles.text}>{tt('Punto d\'incontro')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, disabled && styles.disabled]}
        onPress={onLocation}
        disabled={disabled || sendingLocation}
        accessibilityRole="button"
        accessibilityLabel={tt('Invia la mia posizione')}
        data-testid="send-location-button"
      >
        {sendingLocation ? (
          <ActivityIndicator size="small" color={colors.lime} />
        ) : (
          <Ionicons name="location" size={16} color={colors.lime} />
        )}
        <Text style={styles.text}>{tt('Invia la mia posizione')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  button: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 12, backgroundColor: colors.backgroundLight,
    borderWidth: 1, borderColor: colors.border,
  },
  disabled: { opacity: 0.5 },
  text: { color: colors.lime, fontSize: 12.5, fontWeight: '700' },
});
