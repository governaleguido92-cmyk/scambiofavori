import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaderboardUser } from '../../services/api';
import { styles } from '../../styles/profile.styles';
import { tt } from '../../i18n/tt';

const PODIUM_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

interface LeaderboardModalProps {
  visible: boolean;
  loading: boolean;
  failed: boolean;
  users: LeaderboardUser[];
  currentUserId?: string;
  onClose: () => void;
}

/** La classifica si carica solo quando la apri. */
export function LeaderboardModal({ visible, loading, failed, users, currentUserId, onClose }: LeaderboardModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.leaderboardModal]}>
          <Text style={styles.modalTitle}>{tt('Classifica Community')}</Text>

          {loading ? (
            <ActivityIndicator style={local.state} size="large" color="#B8C868" />
          ) : failed ? (
            <Text style={local.stateText}>{tt('Non riesco a caricare la classifica adesso. Riprova tra poco.')}</Text>
          ) : users.length === 0 ? (
            <Text style={local.stateText}>{tt('La classifica è ancora vuota: completa un favore per entrarci!')}</Text>
          ) : (
            <ScrollView style={styles.leaderboardList}>
              {users.map((item, index) => (
                <View key={item.user_id} style={[styles.leaderboardItem, item.user_id === currentUserId && styles.leaderboardItemMe]}>
                  <View style={styles.leaderboardRank}>
                    {index < PODIUM_COLORS.length ? (
                      <Ionicons name="trophy" size={24} color={PODIUM_COLORS[index]} />
                    ) : (
                      <Text style={styles.leaderboardRankText}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text style={styles.leaderboardName}>{item.name}</Text>
                    <Text style={styles.leaderboardTitle}>{tt(item.title)}</Text>
                  </View>
                  <View style={styles.leaderboardScore}>
                    <Text style={styles.leaderboardScoreValue}>{item.community_score}</Text>
                    <Text style={styles.leaderboardScoreLabel}>{tt('punti')}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.modalCloseText}>{tt('Chiudi')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  state: { marginVertical: 40 },
  stateText: { color: '#C4DACB', fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 32, paddingHorizontal: 16 },
});
