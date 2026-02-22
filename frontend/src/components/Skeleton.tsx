import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Skeleton per una card di favore
export const FavorCardSkeleton: React.FC = () => (
  <View style={styles.favorCard}>
    <View style={styles.favorHeader}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
    <Skeleton width="90%" height={18} style={{ marginTop: 12 }} />
    <Skeleton width="100%" height={14} style={{ marginTop: 8 }} />
    <Skeleton width="70%" height={14} style={{ marginTop: 4 }} />
    <View style={styles.favorFooter}>
      <Skeleton width={80} height={24} borderRadius={12} />
      <Skeleton width={60} height={24} borderRadius={12} />
    </View>
  </View>
);

// Skeleton per la lista favori nella home
export const FavorsListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <View>
    {Array.from({ length: count }).map((_, index) => (
      <FavorCardSkeleton key={index} />
    ))}
  </View>
);

// Skeleton per i marker della mappa
export const MapMarkersSkeleton: React.FC = () => (
  <View style={styles.mapContainer}>
    <Skeleton width="100%" height={300} borderRadius={16} />
    <View style={styles.mapFilters}>
      <Skeleton width={80} height={32} borderRadius={16} />
      <Skeleton width={80} height={32} borderRadius={16} />
      <Skeleton width={80} height={32} borderRadius={16} />
    </View>
  </View>
);

// Skeleton per il profilo
export const ProfileSkeleton: React.FC = () => (
  <View style={styles.profileContainer}>
    <View style={styles.profileHeader}>
      <Skeleton width={80} height={80} borderRadius={40} />
      <View style={{ flex: 1, marginLeft: 16 }}>
        <Skeleton width="60%" height={20} />
        <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
        <Skeleton width="50%" height={14} style={{ marginTop: 4 }} />
      </View>
    </View>
    <View style={styles.statsRow}>
      <Skeleton width="30%" height={60} borderRadius={12} />
      <Skeleton width="30%" height={60} borderRadius={12} />
      <Skeleton width="30%" height={60} borderRadius={12} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#333',
  },
  favorCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  favorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  favorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  mapContainer: {
    padding: 16,
  },
  mapFilters: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  profileContainer: {
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
