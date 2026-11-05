import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import type { ShelfBadge } from '../../utils/profileProgress';
import type { BadgeProgress } from '../../services/api';

/** Ogni badge ha la sua icona (nomi Ionicons mandati dal server); senza nome valido, un nastro. */
export const badgeIconName = (icon: string): string => (icon in Ionicons.glyphMap ? icon : 'ribbon');

interface BadgeShelfProps {
  /** Tutti i badge, già ordinati con quelli ottenuti per primi. */
  badges: ShelfBadge[];
  onPress: (badge: ShelfBadge) => void;
  /** A che punto sei con ogni badge, per mostrare "7/20" sotto quelli non ancora ottenuti. */
  progress?: Record<string, BadgeProgress>;
}

/** La fila dei badge con il conteggio degli ottenuti. */
export function BadgeShelf({ badges, onPress, progress = {} }: BadgeShelfProps) {
  const earnedCount = badges.filter((badge) => badge.earned).length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{tt('Badge Comunitari')}</Text>
        {badges.length > 0 && (
          <Text style={styles.badgeHint} accessibilityLabel={tx('{0} badge ottenuti su {1}', [earnedCount, badges.length])}>
            {tx('{0} di {1}', [earnedCount, badges.length])}
          </Text>
        )}
      </View>
      <Text style={styles.badgeHint}>{tt('Tocca un badge per scoprire come ottenerlo')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {badges.map((badge) => (
          <TouchableOpacity
            key={badge.id}
            style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
            onPress={() => onPress(badge)}
            accessibilityRole="button"
            accessibilityLabel={`${tt(badge.name)}, ${badge.earned ? tt('Ottenuto!') : tt('Non ancora ottenuto')}`}
          >
            <View style={[styles.badgeIcon, { backgroundColor: badge.earned ? badge.color : '#333' }]}>
              <Ionicons name={badgeIconName(badge.icon) as any} size={24} color={badge.earned ? '#fff' : '#A5A89B'} />
            </View>
            <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>{tt(badge.name)}</Text>
            {!badge.earned && (
              <Text style={styles.badgeHint}>
                {progress[badge.id] ? `${progress[badge.id].current}/${progress[badge.id].target}` : ''}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
