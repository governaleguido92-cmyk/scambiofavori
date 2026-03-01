import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

interface ProfileCompletionItem {
  id: string;
  label: string;
  completed: boolean;
  points: number;
}

interface ProfileCompletionBarProps {
  token: string;
  onItemPress?: (itemId: string) => void;
}

const STEP_ICONS: Record<string, string> = {
  name: 'person',
  photo: 'camera',
  skills: 'school',
  first_favor: 'hand-left',
};

export const ProfileCompletionBar: React.FC<ProfileCompletionBarProps> = ({
  token,
  onItemPress,
}) => {
  const [percentage, setPercentage] = useState(0);
  const [items, setItems] = useState<ProfileCompletionItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [badgeEarned, setBadgeEarned] = useState(false);

  useEffect(() => {
    loadCompletion();
  }, [token]);

  const loadCompletion = async () => {
    try {
      const data = await api.getProfileCompletion(token);
      setPercentage(data.percentage);
      setItems(data.items);
      if (data.badge_earned) {
        setBadgeEarned(true);
      }
    } catch (error) {
      console.log('Error loading profile completion:', error);
    }
  };

  if (percentage === 100) {
    return null;
  }

  const completedCount = items.filter(i => i.completed).length;
  const incompleteItems = items.filter(i => !i.completed);

  return (
    <View style={styles.container} data-testid="profile-completion-bar">
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="person-circle" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Completa il tuo profilo</Text>
            <Text style={styles.subtitle}>
              {completedCount}/4 completati • {percentage}%
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {/* 4-Segment Progress Bar */}
      <View style={styles.segmentedBar}>
        {items.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.segment,
              index < items.length - 1 && styles.segmentGap,
              item.completed && styles.segmentFilled,
            ]}
            data-testid={`segment-${item.id}`}
          />
        ))}
      </View>

      {/* Step Labels */}
      <View style={styles.stepLabels}>
        {items.map((item) => (
          <View key={item.id} style={styles.stepLabel}>
            <Ionicons
              name={(item.completed ? 'checkmark-circle' : STEP_ICONS[item.id] || 'ellipse') as any}
              size={12}
              color={item.completed ? colors.accent : colors.textMuted}
            />
          </View>
        ))}
      </View>

      {expanded && (
        <View style={styles.itemsList}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, item.completed && styles.itemCompleted]}
              onPress={() => !item.completed && onItemPress?.(item.id)}
              disabled={item.completed}
              data-testid={`completion-item-${item.id}`}
            >
              <View style={[
                styles.itemIcon,
                item.completed && styles.itemIconCompleted,
              ]}>
                <Ionicons
                  name={(item.completed ? 'checkmark' : STEP_ICONS[item.id] || 'ellipse') as any}
                  size={14}
                  color={item.completed ? '#fff' : colors.textMuted}
                />
              </View>
              <Text style={[
                styles.itemLabel,
                item.completed && styles.itemLabelCompleted,
              ]}>
                {item.label}
              </Text>
              <Text style={[styles.itemPoints, item.completed && styles.itemPointsDone]}>
                {item.completed ? '25%' : '+25%'}
              </Text>
            </TouchableOpacity>
          ))}
          
          <View style={styles.badgeInfo}>
            <Ionicons name="ribbon" size={14} color={colors.granelli} />
            <Text style={styles.badgeInfoText}>
              Completa al 100% per il badge "Profilo Completo"!
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  segmentedBar: {
    flexDirection: 'row',
    marginTop: 10,
    height: 8,
  },
  segment: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 4,
  },
  segmentGap: {
    marginRight: 4,
  },
  segmentFilled: {
    backgroundColor: colors.accent,
  },
  stepLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  stepLabel: {
    flex: 1,
    alignItems: 'center',
  },
  itemsList: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  itemCompleted: {
    opacity: 0.6,
  },
  itemIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemIconCompleted: {
    backgroundColor: colors.accent,
  },
  itemLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
  },
  itemLabelCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  itemPoints: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  itemPointsDone: {
    color: colors.textMuted,
  },
  badgeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.granelliMuted,
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  badgeInfoText: {
    flex: 1,
    color: colors.granelli,
    fontSize: 11,
  },
});
