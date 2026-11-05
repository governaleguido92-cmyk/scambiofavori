import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor } from '../../src/services/api';
import { offlineCache } from '../../src/utils/offlineCache';
import colors from '../../src/theme/colors';
import { MapMarkersSkeleton } from '../../src/components/Skeleton';
import { BrandLogo } from '../../src/components/BrandLogo';
import { useTranslation } from 'react-i18next';
import { logger } from '../../src/utils/logger';
import { tt } from '../../src/i18n/tt';
import { RadiusSlider } from '../../src/components/RadiusSlider';
import { FavorRadar } from '../../src/components/FavorRadar';
import { FavorCard } from '../../src/components/FavorCard';
import { FavorTypeTabs, FavorType } from '../../src/components/FavorTypeTabs';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, formatRadius, withinRadius } from '../../src/utils/radius';


type Coordinates = { latitude: number; longitude: number };

export default function MapScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<FavorType>('request');
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const getUserLocation = async (): Promise<Coordinates | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setUserLocation(coords);
        return coords;
      }
    } catch (error) {
      logger.debug('Error getting location:', error);
    }
    return null;
  };

  const loadFavors = useCallback(async () => {
    try {
      setLoading(true);
      const location = await getUserLocation();
      const params: any = { status: 'active', type: selectedType };
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = MAX_RADIUS_KM; // scarico fino al massimo, il raggio scelto filtra sul telefono
      }
      const data = await api.getFavors(params, token || undefined);
      // I tuoi favori stanno in "I Miei": qui si vedono solo quelli dei vicini.
      setFavors(data.filter((favor) => favor.creator_id !== user?.user_id));
      await offlineCache.saveFavors(data);
    } catch (error) {
      logger.debug('Error loading favors:', error);
      const cached = await offlineCache.loadFavors();
      if (cached) setFavors(cached.filter((favor) => favor.type === selectedType && favor.creator_id !== user?.user_id));
    } finally {
      setLoading(false);
    }
  }, [selectedType, token, user?.user_id]);

  useEffect(() => {
    setSelectedId(null);
    loadFavors();
  }, [loadFavors]);

  // Con la posizione attiva si filtra per raggio; senza posizione non c'è distanza e si mostra tutto.
  const visibleFavors = userLocation ? withinRadius(favors, radiusKm) : favors;

  // Un favore selezionato che esce dal raggio non ha più senso evidenziarlo.
  useEffect(() => {
    if (selectedId && !visibleFavors.some((favor) => favor.favor_id === selectedId)) setSelectedId(null);
  }, [visibleFavors, selectedId]);

  const handleSelect = (favorId: string) => {
    setSelectedId(favorId);
  };

  const openFavor = (favor: Favor) => router.push(`/favor/${favor.favor_id}`);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loginPrompt}>{t('auth.login')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BrandLogo />
            <View>
              <Text style={styles.title}>{t('map.title')}</Text>
              <Text style={styles.subtitle}>
                {visibleFavors.length}{' '}{tt('favori nelle vicinanze')}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={loadFavors} accessibilityRole="button" accessibilityLabel={tt('Aggiorna')}>
            <Ionicons name="refresh" size={24} color={colors.lime} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabsWrap}>
          <FavorTypeTabs value={selectedType} onChange={setSelectedType} />
        </View>

        {userLocation ? (
          <RadiusSlider valueKm={radiusKm} onChange={setRadiusKm} label={tt('Raggio di ricerca')} />
        ) : (
          <View style={styles.noLocationNote}>
            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
            <Text style={styles.noLocationText}>{tt('Attiva la posizione per scegliere il raggio di ricerca')}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.skeletonContainer}>
            <MapMarkersSkeleton />
          </View>
        ) : (
          <>
            {userLocation && (
              <FavorRadar
                favors={visibleFavors}
                userLocation={userLocation}
                radiusKm={radiusKm}
                selectedId={selectedId}
                onSelect={handleSelect}
                currentUserId={user.user_id}
              />
            )}
            <Text style={styles.privacyText}>
              <Ionicons name="shield-checkmark" size={12} color={colors.lime} />{' '}
              {tt('Le posizioni sono approssimative per proteggere la privacy')}
            </Text>

            {visibleFavors.length === 0 ? (
              <Text style={styles.emptyText}>
                {userLocation
                  ? tt('Nessun favore in questo raggio: prova ad allargare il raggio di ricerca')
                  : tt('Nessun favore trovato')}
                {userLocation ? ` (${formatRadius(radiusKm)})` : ''}
              </Text>
            ) : (
              <View style={styles.grid}>
                {visibleFavors.map((item) => (
                  <FavorCard
                    key={item.favor_id}
                    item={item}
                    currentUserId={user.user_id}
                    onPress={openFavor}
                    highlighted={item.favor_id === selectedId}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 24 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginPrompt: { color: colors.textSecondary, fontSize: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  refreshButton: { padding: 8 },
  tabsWrap: { paddingHorizontal: 20, marginBottom: 12 },
  noLocationNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  noLocationText: { flex: 1, color: colors.textMuted, fontSize: 12 },
  skeletonContainer: { paddingHorizontal: 20 },
  privacyText: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyText: {
    marginHorizontal: 20,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20 },
});
