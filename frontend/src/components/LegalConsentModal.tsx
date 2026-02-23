import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '../theme/colors';

interface LegalConsentModalProps {
  visible: boolean;
  onAccept: () => Promise<void>;
}

export default function LegalConsentModal({ visible, onAccept }: LegalConsentModalProps) {
  const router = useRouter();
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const canProceed = tosAccepted && privacyAccepted;

  const handleAccept = async () => {
    if (!canProceed) return;
    
    setLoading(true);
    try {
      await onAccept();
      // Modal will be closed by parent via visible prop change
    } catch (error) {
      console.error('Error accepting legal terms:', error);
      // Show error to user - modal stays open
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
            </View>
            <Text style={styles.title}>Benvenuto in Scambio di Favori!</Text>
            <Text style={styles.subtitle}>
              Prima di iniziare, leggi e accetta i nostri termini
            </Text>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Disclaimer Box */}
            <View style={styles.disclaimerBox}>
              <Ionicons name="information-circle" size={20} color={colors.warning} />
              <Text style={styles.disclaimerText}>
                L'app è un facilitatore e non risponde della condotta degli utenti. 
                Ogni scambio avviene sotto la tua esclusiva responsabilità.
              </Text>
            </View>

            {/* Summary Box */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>In breve:</Text>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.summaryText}>
                  Siamo un intermediario tra privati
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.summaryText}>
                  Scambi solo con Granelli, mai denaro reale
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.summaryText}>
                  La tua posizione esatta resta privata
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.summaryText}>
                  Puoi eliminare il tuo account quando vuoi
                </Text>
              </View>
            </View>

            {/* ToS Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setTosAccepted(!tosAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, tosAccepted && styles.checkboxChecked]}>
                {tosAccepted && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <View style={styles.checkboxTextContainer}>
                <Text style={styles.checkboxText}>
                  Ho letto e accetto i{' '}
                  <Text 
                    style={styles.linkText}
                    onPress={() => router.push('/legal')}
                  >
                    Termini di Servizio
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>

            {/* Privacy Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setPrivacyAccepted(!privacyAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                {privacyAccepted && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <View style={styles.checkboxTextContainer}>
                <Text style={styles.checkboxText}>
                  Ho letto e accetto la{' '}
                  <Text 
                    style={styles.linkText}
                    onPress={() => router.push('/legal')}
                  >
                    Privacy Policy
                  </Text>
                  {' '}(GDPR)
                </Text>
              </View>
            </TouchableOpacity>

            {/* Info Text */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.textMuted} />
              <Text style={styles.infoText}>
                Accettando, confermi di aver compreso che la piattaforma è un semplice 
                intermediario e che ogni scambio è sotto la tua responsabilità.
              </Text>
            </View>
          </ScrollView>

          {/* Button */}
          <TouchableOpacity
            style={[styles.acceptButton, !canProceed && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!canProceed || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Text style={[styles.acceptButtonText, !canProceed && styles.acceptButtonTextDisabled]}>
                  Accetto e Continuo
                </Text>
                <Ionicons 
                  name="arrow-forward" 
                  size={20} 
                  color={canProceed ? colors.background : colors.textMuted} 
                />
              </>
            )}
          </TouchableOpacity>

          {/* Legal Link */}
          <TouchableOpacity 
            style={styles.legalLinkContainer}
            onPress={() => router.push('/legal')}
          >
            <Text style={styles.legalLink}>
              Leggi il testo completo
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  content: {
    maxHeight: 320,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
    fontWeight: '500',
  },
  summaryBox: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  linkText: {
    color: colors.accent,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
    gap: 8,
  },
  acceptButtonDisabled: {
    backgroundColor: colors.border,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  acceptButtonTextDisabled: {
    color: colors.textMuted,
  },
  legalLinkContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  legalLink: {
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
