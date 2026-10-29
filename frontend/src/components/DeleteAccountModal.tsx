import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';

interface DeleteAccountModalProps {
  visible: boolean;
  /** Email of the signed-in user: the user must type it again to confirm. */
  email: string;
  onClose: () => void;
  /** Performs the deletion; reject with an Error to show its message in the dialog. */
  onConfirm: (confirmEmail: string) => Promise<void>;
}

export const emailsMatch = (typed: string, email: string): boolean =>
  typed.trim().length > 0 && typed.trim().toLowerCase() === email.trim().toLowerCase();

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, email, onClose, onConfirm }) => {
  const [typedEmail, setTypedEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = emailsMatch(typedEmail, email) && !deleting;

  const handleClose = () => {
    if (deleting) return;
    setTypedEmail('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(typedEmail.trim());
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Impossibile eliminare l\'account. Riprova.');
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Ionicons name="warning" size={24} color={colors.error} />
            <Text style={styles.title} accessibilityRole="header">{tt('Elimina account')}</Text>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={tt('Chiudi')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.warning}>{tt('Questa azione è definitiva e non si può annullare.')}</Text>
          <Text style={styles.body}>{tt('• Il tuo profilo, i tuoi messaggi e le tue notifiche vengono cancellati.')}{'\n'}{tt('• La foto profilo viene rimossa.')}{'\n'}{tt('• I favori e le recensioni che hai scritto restano per gli altri utenti, ma senza i tuoi dati personali (il tuo nome diventa "Utente eliminato").')}{'\n'}{tt('• I tuoi Granelli andranno persi.')}{'\n'}{tt('• I dati dei pagamenti sono conservati per gli obblighi di legge.')}</Text>

          <Text style={styles.label}>{tt('Per confermare, scrivi la tua email:')}</Text>
          <Text style={styles.emailHint}>{email}</Text>
          <TextInput
            style={styles.input}
            value={typedEmail}
            onChangeText={setTypedEmail}
            placeholder={tt('la tua email')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!deleting}
            accessibilityLabel={tt('Conferma la tua email')}
          />

          {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={deleting}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{tt('Annulla')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton, !canDelete && styles.deleteButtonDisabled]}
              onPress={handleDelete}
              disabled={!canDelete}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canDelete }}
              accessibilityLabel={tt('Elimina definitivamente il mio account')}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteText}>{tt('Elimina definitivamente')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  title: { flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  warning: { color: colors.error, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  emailHint: { color: colors.accent, fontSize: 14, marginTop: 2, marginBottom: 8 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 16,
  },
  error: { color: colors.error, fontSize: 14, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cancelButton: { backgroundColor: colors.backgroundLight },
  cancelText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  deleteButton: { backgroundColor: colors.error },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
