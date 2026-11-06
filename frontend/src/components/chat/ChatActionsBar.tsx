import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';

interface AttachButtonProps {
  open: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Il «+» accanto alla barra di scrittura: apre il menu con punto d'incontro e posizione. */
export function AttachButton({ open, disabled, onPress }: AttachButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.plus, open && styles.plusOpen, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={tt('Allega')}
      data-testid="chat-attach-button"
    >
      <Ionicons name={open ? 'close' : 'add'} size={24} color={open ? colors.background : colors.accent} />
    </TouchableOpacity>
  );
}

interface ChatActionsMenuProps {
  open: boolean;
  sendingLocation: boolean;
  onMeetingPoint: () => void;
  onLocation: () => void;
}

/** Menu sopra la barra di scrittura: due righe pulite, una per azione. */
export function ChatActionsMenu({ open, sendingLocation, onMeetingPoint, onLocation }: ChatActionsMenuProps) {
  if (!open) return null;
  return (
    <View style={styles.menu}>
      <TouchableOpacity style={styles.item} onPress={onMeetingPoint} accessibilityRole="button" accessibilityLabel={tt('Punto d\'incontro')}>
        <View style={styles.itemIcon}>
          <Ionicons name="people" size={18} color={colors.background} />
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle}>{tt('Punto d\'incontro')}</Text>
          <Text style={styles.itemSub}>{tt('Scegli dove e quando vedervi')}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.item}
        onPress={onLocation}
        disabled={sendingLocation}
        accessibilityRole="button"
        accessibilityLabel={tt('Invia la mia posizione')}
        data-testid="send-location-button"
      >
        <View style={styles.itemIcon}>
          {sendingLocation ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="location" size={18} color={colors.background} />}
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle}>{tt('La mia posizione')}</Text>
          <Text style={styles.itemSub}>{tt('Mandala solo a chi ti sta aiutando')}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.accent },
  plusOpen: { backgroundColor: colors.accent },
  disabled: { opacity: 0.5 },
  menu: { marginHorizontal: 12, marginBottom: 8, borderRadius: 16, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  itemIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, gap: 1 },
  itemTitle: { color: colors.textPrimary, fontSize: 14.5, fontWeight: '600' },
  itemSub: { color: colors.textMuted, fontSize: 12 },
});
