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

// Skeleton per una scheda della griglia favori (banda + testo + riga in basso)
const FavorGridCardSkeleton: React.FC = () => (
  <View style={styles.gridCard}>
    <Skeleton width="100%" height={74} borderRadius={0} />
    <View style={{ padding: 12 }}>
      <Skeleton width="50%" height={12} />
      <Skeleton width="90%" height={18} style={{ marginTop: 10 }} />
      <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="70%" height={12} style={{ marginTop: 4 }} />
    </View>
  </View>
);

// Skeleton della griglia favori nella home (2 colonne, come la lista vera)
export const FavorsGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <View style={styles.gridWrap}>
    {Array.from({ length: count }).map((_, index) => (
      <FavorGridCardSkeleton key={index} />
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
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    flexBasis: '48.5%',
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 236,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2E3420',
    backgroundColor: '#171A10',
    overflow: 'hidden',
  },
  skeleton: {
    backgroundColor: '#333',
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
