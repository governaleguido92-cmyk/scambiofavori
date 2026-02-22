import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reportType: 'favor' | 'user';
  targetId: string;
  targetName?: string;
  token: string;
}

const REPORT_REASONS = {
  favor: [
    { id: 'offensive', label: 'Contenuto offensivo', icon: 'warning' },
    { id: 'spam', label: 'Spam o pubblicità', icon: 'megaphone' },
    { id: 'fraud', label: 'Possibile frode', icon: 'alert-circle' },
    { id: 'inappropriate', label: 'Contenuto inappropriato', icon: 'eye-off' },
    { id: 'other', label: 'Altro', icon: 'ellipsis-horizontal' },
  ],
  user: [
    { id: 'offensive', label: 'Comportamento offensivo', icon: 'warning' },
    { id: 'spam', label: 'Spam o pubblicità', icon: 'megaphone' },
    { id: 'fraud', label: 'Possibile frode', icon: 'alert-circle' },
    { id: 'fake_profile', label: 'Profilo falso', icon: 'person-remove' },
    { id: 'inappropriate', label: 'Comportamento inappropriato', icon: 'eye-off' },
    { id: 'other', label: 'Altro', icon: 'ellipsis-horizontal' },
  ],
};

export const ReportModal: React.FC<ReportModalProps> = ({
  visible,
  onClose,
  reportType,
  targetId,
  targetName,
  token,
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = REPORT_REASONS[reportType];

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Errore', 'Seleziona un motivo per la segnalazione');
      return;
    }

    setSubmitting(true);
    try {
      await api.reportContent(
        reportType,
        targetId,
        selectedReason,
        description || undefined,
        token
      );
      Alert.alert(
        'Segnalazione inviata',
        'Grazie per aiutarci a mantenere la community sicura. Esamineremo la segnalazione al più presto.',
        [{ text: 'OK', onPress: onClose }]
      );
      setSelectedReason(null);
      setDescription('');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile inviare la segnalazione');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    setDescription('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Ionicons name="flag" size={24} color="#ff6b6b" />
            <Text style={styles.title}>
              Segnala {reportType === 'favor' ? 'Annuncio' : 'Utente'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {targetName && (
            <Text style={styles.targetInfo}>
              Stai segnalando: <Text style={styles.targetName}>{targetName}</Text>
            </Text>
          )}

          <Text style={styles.sectionTitle}>Motivo della segnalazione</Text>

          <View style={styles.reasonsList}>
            {reasons.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonItem,
                  selectedReason === reason.id && styles.reasonItemSelected,
                ]}
                onPress={() => setSelectedReason(reason.id)}
                data-testid={`report-reason-${reason.id}`}
              >
                <View style={[
                  styles.reasonIcon,
                  selectedReason === reason.id && styles.reasonIconSelected,
                ]}>
                  <Ionicons
                    name={reason.icon as any}
                    size={18}
                    color={selectedReason === reason.id ? '#fff' : '#888'}
                  />
                </View>
                <Text style={[
                  styles.reasonLabel,
                  selectedReason === reason.id && styles.reasonLabelSelected,
                ]}>
                  {reason.label}
                </Text>
                {selectedReason === reason.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#ff6b6b" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Dettagli aggiuntivi (opzionale)</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Descrivi il problema..."
            placeholderTextColor="#666"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              data-testid="submit-report-button"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitButtonText}>Invia Segnalazione</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  targetInfo: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
  },
  targetName: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonsList: {
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reasonItemSelected: {
    borderColor: '#ff6b6b',
    backgroundColor: '#ff6b6b15',
  },
  reasonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reasonIconSelected: {
    backgroundColor: '#ff6b6b',
  },
  reasonLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  reasonLabelSelected: {
    fontWeight: '600',
  },
  descriptionInput: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#ff6b6b',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
