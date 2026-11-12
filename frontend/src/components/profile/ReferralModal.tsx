import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import { granelliWord } from '../../utils/granelli';
import { modalAnimation } from '../../utils/reducedMotion';
import colors from '../../theme/colors';

export interface ReferralInfo {
  referral_code: string;
  successful_referrals: number;
  bonus_per_referral: number;
}

const DEFAULT_BONUS = 3;

interface ReferralModalProps {
  visible: boolean;
  info: ReferralInfo | null;
  onClose: () => void;
  onShare: () => void;
}

export function ReferralModal({ visible, info, onClose, onShare }: ReferralModalProps) {
  const bonus = info?.bonus_per_referral || DEFAULT_BONUS;
  const invited = info?.successful_referrals || 0;
  return (
    <Modal visible={visible} transparent animationType={modalAnimation()} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{tt('Invita i Tuoi Amici')}</Text>
          <Text style={styles.modalDescription}>{tx('Guadagni {0} {1} quando un amico completa il primo favore', [bonus, granelliWord(bonus)])}</Text>

          <View style={styles.referralCodeBox}>
            <Text style={styles.referralCodeLabel}>{tt('Il tuo codice:')}</Text>
            <Text style={styles.referralCode} selectable>{info?.referral_code || '...'}</Text>
          </View>

          <View style={styles.referralStats}>
            <View style={styles.referralStatItem}>
              <Text style={styles.referralStatValue}>{invited}</Text>
              <Text style={styles.referralStatLabel}>{tt('Inviti Completati')}</Text>
            </View>
            <View style={styles.referralStatItem}>
              <Text style={styles.referralStatValue}>{invited * bonus}</Text>
              <Text style={styles.referralStatLabel}>{tt('Granelli Guadagnati')}</Text>
            </View>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.modalCancelText}>{tt('Chiudi')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmButton} onPress={onShare} disabled={!info} accessibilityRole="button">
              <Ionicons name="share-social" size={20} color={colors.background} />
              <Text style={styles.modalConfirmText}>{tt('Condividi')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
