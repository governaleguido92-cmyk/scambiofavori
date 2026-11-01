import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import type { ShelfBadge } from '../../utils/profileProgress';

export const BADGE_ICONS: Record<string, string> = {
  heart: 'heart',
  home: 'home',
  school: 'school',
  people: 'people',
  flash: 'heart-sharp',
  footsteps: 'footsteps',
  sunny: 'heart-circle',
  ribbon: 'heart-half',
  star: 'heart',
  trophy: 'heart-circle-outline',
  medal: 'heart-outline',
};

export const badgeIconName = (icon: string): string => BADGE_ICONS[icon] || 'ribbon';

interface BadgeShelfProps {
  /** Tutti i badge, già ordinati con quelli ottenuti per primi. */
  badges: ShelfBadge[];
  onPress: (badge: ShelfBadge) => void;
}

/** La fila dei badge con il conteggio degli ottenuti. */
export function BadgeShelf({ badges, onPress }: BadgeShelfProps) {
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
              <Ionicons name={badgeIconName(badge.icon) as any} size={24} color={badge.earned ? '#fff' : '#8FA595'} />
            </View>
            <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>{tt(badge.name)}</Text>
            {!badge.earned && <Ionicons name="lock-closed" size={14} color="#8FA595" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
