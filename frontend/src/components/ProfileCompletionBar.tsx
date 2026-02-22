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

export const ProfileCompletionBar: React.FC<ProfileCompletionBarProps> = ({
  token,
  onItemPress,
}) => {
  const [percentage, setPercentage] = useState(0);
  const [items, setItems] = useState<ProfileCompletionItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [badgeEarned, setBadgeEarned] = useState(false);
  const [animatedWidth] = useState(new Animated.Value(0));

  useEffect(() => {
    loadCompletion();
  }, [token]);

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: percentage,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

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
    return null; // Hide when profile is complete
  }

  const incompleteItems = items.filter(item => !item.completed);

  return (
    <View style={styles.container} data-testid="profile-completion-bar">
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="person-circle" size={24} color="#4ecca3" />
          </View>
          <View>
            <Text style={styles.title}>Completa il tuo profilo</Text>
            <Text style={styles.subtitle}>
              {percentage}% completato • {incompleteItems.length} {incompleteItems.length === 1 ? 'passo' : 'passi'} rimasti
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#888"
        />
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: animatedWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
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
                  name={item.completed ? 'checkmark' : getItemIcon(item.id)}
                  size={16}
                  color={item.completed ? '#fff' : '#888'}
                />
              </View>
              <Text style={[
                styles.itemLabel,
                item.completed && styles.itemLabelCompleted,
              ]}>
                {item.label}
              </Text>
              <Text style={styles.itemPoints}>+{item.points}%</Text>
            </TouchableOpacity>
          ))}
          
          <View style={styles.badgeInfo}>
            <Ionicons name="ribbon" size={16} color="#ffd700" />
            <Text style={styles.badgeInfoText}>
              Completa al 100% per guadagnare il badge "Profilo Completo"!
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const getItemIcon = (itemId: string): string => {
  const icons: Record<string, string> = {
    name: 'person',
    photo: 'camera',
    skills: 'school',
    first_favor: 'hand-left',
  };
  return icons[itemId] || 'ellipse';
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ecca320',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressBackground: {
    height: 8,
    backgroundColor: '#0f0f23',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ecca3',
    borderRadius: 4,
  },
  itemsList: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  itemCompleted: {
    opacity: 0.6,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemIconCompleted: {
    backgroundColor: '#4ecca3',
  },
  itemLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  itemLabelCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  itemPoints: {
    color: '#4ecca3',
    fontSize: 13,
    fontWeight: '600',
  },
  badgeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffd70015',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  badgeInfoText: {
    flex: 1,
    color: '#ffd700',
    fontSize: 12,
  },
});
