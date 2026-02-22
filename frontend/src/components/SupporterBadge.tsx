import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SupporterBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  style?: ViewStyle;
}

/**
 * Golden Heart badge displayed next to supporter usernames
 * Used in: Feed cards, Map markers, Chat messages, Profile
 */
export const SupporterBadge: React.FC<SupporterBadgeProps> = ({
  size = 'small',
  showLabel = false,
  style,
}) => {
  const iconSize = size === 'small' ? 12 : size === 'medium' ? 16 : 20;
  
  return (
    <View style={[styles.container, styles[`container_${size}`], style]}>
      <Ionicons name="heart" size={iconSize} color="#ffd700" />
      {showLabel && <Text style={styles.label}>Sostenitore</Text>}
    </View>
  );
};

/**
 * Golden border wrapper for supporter profile pictures
 */
export const SupporterProfileBorder: React.FC<{
  children: React.ReactNode;
  isSupporter: boolean;
  size?: number;
}> = ({ children, isSupporter, size = 40 }) => {
  if (!isSupporter) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.profileBorderWrapper, { width: size + 6, height: size + 6 }]}>
      <View style={styles.profileBorderInner}>
        {children}
      </View>
    </View>
  );
};

/**
 * User name with supporter badge inline
 */
export const UserNameWithBadge: React.FC<{
  name: string;
  isSupporter: boolean;
  nameStyle?: any;
}> = ({ name, isSupporter, nameStyle }) => {
  return (
    <View style={styles.nameRow}>
      <Text style={nameStyle}>{name}</Text>
      {isSupporter && <SupporterBadge size="small" style={{ marginLeft: 4 }} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  container_small: {
    // Default - no extra padding
  },
  container_medium: {
    backgroundColor: '#ffd70020',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  container_large: {
    backgroundColor: '#ffd70020',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  label: {
    color: '#ffd700',
    fontSize: 11,
    fontWeight: '600',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileBorderWrapper: {
    borderRadius: 100,
    padding: 3,
    backgroundColor: '#ffd700',
    // Gradient effect using shadow
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  profileBorderInner: {
    flex: 1,
    borderRadius: 100,
    overflow: 'hidden',
  },
});
