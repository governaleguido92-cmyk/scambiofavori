import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';

export type CreateChoice = 'favore' | 'avviso' | 'evento' | 'presentazione' | 'chat';

interface Option {
  key: CreateChoice;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  { key: 'favore', icon: 'heart', title: 'Un favore', hint: 'Dona o ricevi una mano da un vicino' },
  { key: 'avviso', icon: 'megaphone-outline', title: 'Un avviso', hint: 'Lavori, smarrito o trovato, sicurezza' },
  { key: 'evento', icon: 'calendar-outline', title: 'Un evento', hint: 'Un ritrovo o un\'iniziativa tra vicini' },
  { key: 'presentazione', icon: 'hand-right-outline', title: 'Una presentazione', hint: 'Presentati ai vicini di zona' },
  { key: 'chat', icon: 'chatbubbles-outline', title: 'Un messaggio nella chat', hint: 'Scrivi a chi abita vicino a te' },
];

/** Cosa si può creare dal tasto «Crea»: un favore oppure qualcosa nel «Il Nostro Quartiere». */
export function CreateMenu({ visible, onClose, onChoose }: { visible: boolean; onClose: () => void; onChoose: (choice: CreateChoice) => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tt('Chiudi')}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{tt('Cosa vuoi creare?')}</Text>
          {OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={styles.row}
              onPress={() => onChoose(option.key)}
              accessibilityRole="button"
              data-testid={`create-${option.key}`}
            >
              <View style={[styles.iconBox, option.key === 'favore' && styles.iconBoxFavor]}>
                <Ionicons name={option.icon} size={22} color={option.key === 'favore' ? '#fff' : colors.lime} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{tt(option.title)}</Text>
                <Text style={styles.rowHint}>{tt(option.hint)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>{tt('Annulla')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 8, paddingBottom: 28 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.backgroundCard, borderRadius: 14, padding: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(152,170,74,0.15)' },
  iconBoxFavor: { backgroundColor: colors.accent },
  rowText: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowHint: { color: '#fff', opacity: 0.8, fontSize: 12.5, marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  cancelText: { color: '#fff', fontWeight: '700' },
});
