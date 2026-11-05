import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import { describeRequirement, ShelfBadge } from '../../utils/profileProgress';
import { badgeIconName } from './BadgeShelf';
import type { BadgeProgress } from '../../services/api';

interface BadgeInfoModalProps {
  badge: ShelfBadge | null;
  onClose: () => void;
  progress?: BadgeProgress;
}

/** Descrizione del badge e cosa serve per ottenerlo, ricavato dal requisito mandato dal server. */
export function BadgeInfoModal({ badge, onClose, progress }: BadgeInfoModalProps) {
  const requirement = describeRequirement(badge?.requirement);
  return (
    <Modal visible={badge !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.badgeModalContent}>
          {badge && (
            <>
              <View style={[styles.badgeModalIcon, { backgroundColor: badge.earned ? badge.color : '#333' }]}>
                <Ionicons name={badgeIconName(badge.icon) as any} size={48} color={badge.earned ? '#fff' : '#A5A89B'} />
              </View>
              <Text style={styles.badgeModalTitle}>{tt(badge.name)}</Text>
              <View style={[styles.badgeModalStatus, badge.earned ? styles.badgeEarned : styles.badgeLocked]}>
                <Ionicons name={badge.earned ? 'checkmark-circle' : 'lock-closed'} size={16} color={badge.earned ? '#98AA4A' : '#A5A89B'} />
                <Text style={[styles.badgeStatusText, badge.earned && styles.badgeStatusEarned]}>
                  {badge.earned ? tt('Ottenuto!') : tt('Non ancora ottenuto')}
                </Text>
              </View>
              <Text style={styles.badgeModalDescription}>{tt(badge.description) || tt('Badge della community.')}</Text>
              {!badge.earned && (
                <View style={styles.badgeHowToGet}>
                  <Ionicons name="bulb" size={20} color="#98AA4A" />
                  <Text style={styles.badgeHowToGetText}>{tx(requirement.text, [requirement.value])}</Text>
                </View>
              )}
              {!badge.earned && progress && (
                <View style={{ marginBottom: 16, width: '100%' }} accessibilityLabel={tx('{0} su {1}', [progress.current, progress.target])}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: '#23281A', overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: '#F87828', width: `${Math.round((progress.current / Math.max(progress.target, 1)) * 100)}%` }} />
                  </View>
                  <Text style={[styles.badgeHint, { textAlign: 'center', marginTop: 6 }]}>
                    {progress.blocked
                      ? tt('Per ora è bloccato: troppi annullamenti o segnalazioni.')
                      : tx('{0} su {1}', [progress.current, progress.target])}
                  </Text>
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
