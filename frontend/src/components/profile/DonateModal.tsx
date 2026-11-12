import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import { granelliWord } from '../../utils/granelli';
import { clampDonation, DONATION_QUICK_AMOUNTS } from '../../utils/profileProgress';
import { modalAnimation } from '../../utils/reducedMotion';
import colors from '../../theme/colors';

interface DonateModalProps {
  visible: boolean;
  /** I Granelli che hai: non si può donare di più. */
  balance: number;
  onClose: () => void;
  /** Esegue la donazione; restituisce true se è andata a buon fine. */
  onDonate: (amount: number) => Promise<boolean>;
}

/** Donazione al Fondo Solidarietà: importo sempre valido, scorciatoie e un solo invio alla volta. */
export function DonateModal({ visible, balance, onClose, onDonate }: DonateModalProps) {
  const [amountText, setAmountText] = useState('1');
  const [donating, setDonating] = useState(false);
  const amount = clampDonation(amountText, balance);
  const quickAmounts = DONATION_QUICK_AMOUNTS.filter((quick) => quick <= balance);

  useEffect(() => {
    if (visible) setAmountText('1');
  }, [visible]);

  const change = (delta: number) => {
    if (amount === null) return;
    setAmountText(String(clampDonation(String(amount + delta), balance) ?? 1));
  };

  const confirm = async () => {
    if (amount === null || donating) return;
    setDonating(true);
    try {
      await onDonate(amount);
    } finally {
      setDonating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={modalAnimation()} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{tt('Dona al Fondo Solidarietà')}</Text>
          <Text style={styles.modalDescription}>{tx('I tuoi {0} aiuteranno anziani e persone fragili della community', ['Granelli'])}</Text>
          <Text style={local.balance}>{tx('Ne hai {0}', [balance])}</Text>

          {amount === null ? (
            <Text style={local.noBalance}>{tt('Non hai Granelli da donare adesso: li guadagni aiutando un vicino.')}</Text>
          ) : (
            <>
              <View style={local.quickRow}>
                {quickAmounts.map((quick) => (
                  <TouchableOpacity
                    key={quick}
                    style={[local.quick, amount === quick && local.quickActive]}
                    onPress={() => setAmountText(String(quick))}
                    accessibilityRole="button"
                    accessibilityLabel={`${quick} ${granelliWord(quick)}`}
                  >
                    <Text style={[local.quickText, amount === quick && local.quickTextActive]}>{quick}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.donateInputContainer}>
                <TouchableOpacity style={styles.donateAdjust} onPress={() => change(-1)} accessibilityRole="button" accessibilityLabel={tt('Meno')}>
                  <Ionicons name="remove" size={24} color={colors.background} />
                </TouchableOpacity>
                <TextInput
                  style={styles.donateInput}
                  value={amountText}
                  onChangeText={(text) => setAmountText(text.replace(/[^0-9]/g, ''))}
                  onBlur={() => setAmountText(String(amount))}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel={tt('Quanti Granelli donare')}
                />
                <TouchableOpacity style={styles.donateAdjust} onPress={() => change(1)} accessibilityRole="button" accessibilityLabel={tt('Più')}>
                  <Ionicons name="add" size={24} color={colors.background} />
                </TouchableOpacity>
              </View>
              <Text style={styles.donateCreditsLabel}>{granelliWord(amount)}</Text>
            </>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.modalCancelText}>{tt('Annulla')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirmButton, (amount === null || donating) && styles.modalConfirmButtonDisabled]}
              onPress={confirm}
              disabled={amount === null || donating}
              accessibilityRole="button"
            >
              {donating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="heart" size={20} color={colors.background} />
                  <Text style={styles.modalConfirmText}>{tt('Dona')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  balance: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', marginBottom: 12 },
  noBalance: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 16 },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 },
  quick: {
    minWidth: 54, alignItems: 'center', paddingVertical: 8, borderRadius: 14,
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  quickActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  quickText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  quickTextActive: { color: colors.white },
});
