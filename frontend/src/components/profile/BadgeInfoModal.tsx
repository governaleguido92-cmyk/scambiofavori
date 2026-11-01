import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import { describeRequirement, ShelfBadge } from '../../utils/profileProgress';
import { badgeIconName } from './BadgeShelf';

interface BadgeInfoModalProps {
  badge: ShelfBadge | null;
  onClose: () => void;
}

/** Descrizione del badge e cosa serve per ottenerlo, ricavato dal requisito mandato dal server. */
export function BadgeInfoModal({ badge, onClose }: BadgeInfoModalProps) {
  const requirement = describeRequirement(badge?.requirement);
  return (
    <Modal visible={badge !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.badgeModalContent}>
          {badge && (
            <>
              <View style={[styles.badgeModalIcon, { backgroundColor: badge.earned ? badge.color : '#333' }]}>
                <Ionicons name={badgeIconName(badge.icon) as any} size={48} color={badge.earned ? '#fff' : '#8FA595'} />
              </View>
              <Text style={styles.badgeModalTitle}>{tt(badge.name)}</Text>
              <View style={[styles.badgeModalStatus, badge.earned ? styles.badgeEarned : styles.badgeLocked]}>
                <Ionicons name={badge.earned ? 'checkmark-circle' : 'lock-closed'} size={16} color={badge.earned ? '#B8C868' : '#8FA595'} />
                <Text style={[styles.badgeStatusText, badge.earned && styles.badgeStatusEarned]}>
                  {badge.earned ? tt('Ottenuto!') : tt('Non ancora ottenuto')}
                </Text>
              </View>
              <Text style={styles.badgeModalDescription}>{tt(badge.description) || tt('Badge della community.')}</Text>
              {!badge.earned && (
                <View style={styles.badgeHowToGet}>
                  <Ionicons name="bulb" size={20} color="#FFD700" />
                  <Text style={styles.badgeHowToGetText}>{tx(requirement.text, [requirement.value])}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.badgeModalClose} onPress={onClose} accessibilityRole="button">
                <Text style={styles.badgeModalCloseText}>{tt('Chiudi')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
