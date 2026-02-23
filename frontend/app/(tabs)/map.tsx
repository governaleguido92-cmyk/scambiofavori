import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, CURRENCY_SYMBOL } from '../../src/services/api';
import colors from '../../src/theme/colors';
import { SupporterBadge } from '../../src/components/SupporterBadge';
import { MapMarkersSkeleton } from '../../src/components/Skeleton';

const { width, height } = Dimensions.get('window');
const LATITUDE_DELTA = 0.02;
const LONGITUDE_DELTA = LATITUDE_DELTA * (width / height);

// Map component - using a simple WebView approach for web compatibility
const MapPlaceholder = ({ 
  favors, 
  userLocation, 
  onFavorPress 
}: { 
  favors: Favor[];
  userLocation: { latitude: number; longitude: number } | null;
  onFavorPress: (favor: Favor) => void;
}) => {
  return (
    <View style={styles.mapContainer}>
      {/* Map placeholder with favor circles */}
      <View style={styles.mapView}>
        {/* User location indicator */}
        {userLocation && (
          <View style={styles.userLocationMarker}>
            <View style={styles.userLocationDot} />
            <Text style={styles.userLocationText}>Tu sei qui</Text>
          </View>
        )}
        
        {/* Favor proximity circles */}
        <View style={styles.favorsGrid}>
          {favors.slice(0, 6).map((favor, index) => (
            <TouchableOpacity
              key={favor.favor_id}
              style={[
                styles.favorCircle,
                favor.type === 'offer' ? styles.offerCircle : styles.requestCircle,
                favor.creator_is_supporter && styles.supporterCircle,
                { 
                  left: `${15 + (index % 3) * 30}%`,
                  top: `${20 + Math.floor(index / 3) * 35}%`
                }
              ]}
              onPress={() => onFavorPress(favor)}
              data-testid={`map-favor-${favor.favor_id}`}
            >
              {/* Supporter badge in top-right corner */}
              {favor.creator_is_supporter && (
                <View style={styles.mapSupporterBadge}>
                  <SupporterBadge size="small" />
                </View>
              )}
              <View style={styles.circleInner}>
                <Ionicons 
                  name={favor.type === 'offer' ? 'gift' : 'hand-left'} 
                  size={20} 
                  color={colors.textPrimary} 
                />
                <Text style={styles.circleDistance} numberOfLines={1}>
                  {favor.distance_km ? `${favor.distance_km}km` : '~'}
                </Text>
              </View>
              <View style={styles.circleLabel}>
                <Text style={styles.circleLabelText} numberOfLines={1}>
                  {favor.title}
                </Text>
                <Text style={styles.circleCreatorText} numberOfLines={1}>
                  {favor.creator_name}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Privacy notice */}
        <View style={styles.privacyBanner}>
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={styles.privacyText}>
            Le posizioni sono approssimative per proteggere la privacy
          </Text>
        </View>
      </View>
    </View>
  );
};

export default function MapScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'all' | 'offer' | 'request'>('all');

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      }
    } catch (error) {
      console.log('Error getting location:', error);
    }
    return null;
  };

  const loadFavors = useCallback(async () => {
    try {
      setLoading(true);
      const location = await getUserLocation();
      const params: any = { status: 'active' };
      
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = 10; // 10km radius
      }
      
      if (selectedType !== 'all') {
        params.type = selectedType;
      }
      
      const data = await api.getFavors(params);
      setFavors(data);
    } catch (error) {
      console.error('Error loading favors:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    loadFavors();
  }, [loadFavors]);

  const handleFavorPress = (favor: Favor) => {
    router.push(`/favor/${favor.favor_id}`);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loginPrompt}>Accedi per vedere la mappa</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mappa Favori</Text>
          <Text style={styles.subtitle}>
            {favors.length} favori nelle vicinanze
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={loadFavors}
        >
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Type Filter */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, selectedType === 'all' && styles.filterButtonActive]}
          onPress={() => setSelectedType('all')}
        >
          <Ionicons 
            name="apps" 
            size={16} 
            color={selectedType === 'all' ? colors.background : colors.textSecondary} 
          />
          <Text style={[styles.filterText, selectedType === 'all' && styles.filterTextActive]}>
            Tutti
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, selectedType === 'offer' && styles.filterButtonActive]}
          onPress={() => setSelectedType('offer')}
        >
          <Ionicons 
            name="gift" 
            size={16} 
            color={selectedType === 'offer' ? colors.background : colors.textSecondary} 
          />
          <Text style={[styles.filterText, selectedType === 'offer' && styles.filterTextActive]}>
            Offerte
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, selectedType === 'request' && styles.filterButtonActive]}
          onPress={() => setSelectedType('request')}
        >
          <Ionicons 
            name="hand-left" 
            size={16} 
            color={selectedType === 'request' ? colors.background : colors.textSecondary} 
          />
          <Text style={[styles.filterText, selectedType === 'request' && styles.filterTextActive]}>
            Richieste
          </Text>
        </TouchableOpacity>
      </View>

      {/* Map View */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Caricamento mappa...</Text>
        </View>
      ) : (
        <MapPlaceholder 
          favors={favors}
          userLocation={userLocation}
          onFavorPress={handleFavorPress}
        />
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Offerte</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Richieste</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPrompt: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  mapView: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
    borderRadius: 20,
    position: 'relative',
  },
  userLocationMarker: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
    alignItems: 'center',
  },
  userLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userLocationText: {
    marginTop: 4,
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  favorsGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  favorCircle: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  offerCircle: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  requestCircle: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  circleInner: {
    alignItems: 'center',
  },
  circleDistance: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  circleLabel: {
    position: 'absolute',
    bottom: -20,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 80,
  },
  circleLabelText: {
    fontSize: 9,
    color: colors.textSecondary,
  },
  privacyBanner: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  privacyText: {
    flex: 1,
    fontSize: 11,
    color: colors.primary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
