import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';
import { showRefusal } from '../../utils/notify';

const BIO_MAX = 200;

interface BioCardProps {
  bio: string | null | undefined;
  /** Salva la presentazione (testo vuoto = si toglie). Fa un errore se il testo non è ammesso. */
  onSave: (bio: string) => Promise<void>;
}

/** "Chi sono": due righe su di te, che gli altri leggono nel tuo profilo per sapere con chi hanno a che fare. */
export function BioCard({ bio, onSave }: BioCardProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setText(bio || '');
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(text.trim());
      setOpen(false);
    } catch (error: any) {
      showRefusal(tt('Presentazione non salvata'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={startEditing} accessibilityRole="button" accessibilityLabel={tt('Modifica "Chi sono"')} data-testid="edit-bio">
        <View style={styles.head}>
          <Text style={styles.title}>{tt('Chi sono')}</Text>
          <Ionicons name="pencil" size={15} color={colors.textMuted} />
        </View>
        {bio ? (
          <Text style={styles.bio}>{bio}</Text>
        ) : (
          <Text style={styles.placeholder}>{tt('Scrivi due righe su di te: cosa ti piace fare e come puoi aiutare. Aiuta i vicini a fidarsi di te.')}</Text>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{tt('Chi sono')}</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={tt('Es. Sono Marco, pensionato. Do una mano con il computer e adoro il giardinaggio.')}
              placeholderTextColor={colors.textMuted}
              maxLength={BIO_MAX}
              multiline
              autoFocus
              data-testid="bio-input"
            />
            <Text style={styles.counter}>{text.length}/{BIO_MAX}  ·  {tt('Visibile a tutti i vicini. Niente telefono, email, link o soldi.')}</Text>
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setOpen(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.save, saving && styles.saveDisabled]} onPress={save} disabled={saving} accessibilityRole="button" data-testid="bio-save">
                {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.saveText}>{tt('Salva')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 12, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  bio: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 21 },
  placeholder: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  input: { minHeight: 100, borderRadius: 12, backgroundColor: colors.backgroundCard, color: colors.textPrimary, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 12 },
  buttons: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  cancelText: { color: colors.textPrimary, fontWeight: '700' },
  save: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent },
  saveDisabled: { opacity: 0.85 },
  saveText: { color: colors.background, fontWeight: '800' },
});
