import { NeighborhoodButton } from '../../src/components/NeighborhoodButton';
import { GranelloIcon } from '../../src/components/GranelloIcon';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, ThanksEntry } from '../../src/services/api';
import colors from '../../src/theme/colors';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { MessagesButton } from '../../src/components/MessagesButton';
import { FavorsGridSkeleton } from '../../src/components/Skeleton';
import { NetworkErrorBanner } from '../../src/components/OfflineNotice';
import { offlineCache } from '../../src/utils/offlineCache';
import { useTranslation } from 'react-i18next';
import { styles } from '../../src/styles/home.styles';
import { logger } from '../../src/utils/logger';
import { tt, tx } from '../../src/i18n/tt';
import { getCategoryVisual, formatDistance } from '../../src/utils/favorVisual';
import { FavorCard } from '../../src/components/FavorCard';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, pickWidenedRadius } from '../../src/utils/radius';
import { FirstSteps } from '../../src/components/FirstSteps';
import { hitSlopFor } from '../../src/utils/touch';
import { FavorTypeTabs, FavorType } from '../../src/components/FavorTypeTabs';
import { buildRows, filterFavors, FavorRow, FavorSectionKey } from '../../src/utils/favorSections';

const NARROW_SCREEN_PX = 380;

export default function HomeScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  // Sui telefoni stretti il logo lascia spazio al saluto: i pulsanti e i Granelli a destra restano interi
  const { width: screenWidth } = useWindowDimensions();
  const isNarrowScreen = screenWidth < NARROW_SCREEN_PX;
  const { t } = useTranslation();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [selectedType, setSelectedType] = useState<FavorType>('request');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [thanksBoard, setThanksBoard] = useState<ThanksEntry[]>([]);
  const [networkError, setNetworkError] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mySkills, setMySkills] = useState<string[]>([]);
  // Se i favori vicini sono pochi la ricerca si allarga da sola: qui il raggio usato
  const [widenedKm, setWidenedKm] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<FavorSectionKey>>(new Set());

  // Load unread notifications count
  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getUnreadNotificationsCount(token);
      setUnreadNotifications(data.unread_count);
    } catch (error) {
      logger.debug('Error loading notification count:', error);
    }
  }, [token]);

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch (error) {
      logger.debug('Error getting location:', error);
    }
  };

  const loadThanksBoard = async () => {
    try {
      const data = await api.getThanksBoard(token || '', 5);
      setThanksBoard(data);
    } catch (error) {
      logger.debug('Error loading thanks board:', error);
    }
  };

  const loadFavors = useCallback(async () => {
    try {
      setNetworkError(false);
      const params: any = { status: 'active' };
      params.type = selectedType;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = MAX_RADIUS_KM; // si scarica fino al massimo; il raggio vero si sceglie sotto
      }
      const data = await api.getFavors(params, token || undefined);
      // I favori che hai pubblicato tu stanno in "I Miei": qui si vedono solo quelli degli altri.
      const mine = data.filter((f) => f.creator_id !== user?.user_id);
      // Si parte stretti (5 km) e si allarga a 10 e 15 solo se ci sono pochi favori vicini
      let others = mine;
      let widened: number | null = null;
      if (location) {
        const radius = pickWidenedRadius(mine.map((f) => f.distance_km).filter((km): km is number => typeof km === 'number'));
        others = mine.filter((f) => typeof f.distance_km !== 'number' || f.distance_km <= radius);
        widened = radius > DEFAULT_RADIUS_KM ? radius : null;
      }
      setWidenedKm(widened);
      // Se nulla è cambiato si tiene l'elenco com'è: niente nuovo disegno ogni 3 secondi
      setFavors((previous) => (JSON.stringify(previous) === JSON.stringify(others) ? previous : others));
      await offlineCache.saveFavors(data);
    } catch (error) {
      logger.debug('Error loading favors:', error);
      setNetworkError(true);
      const cached = await offlineCache.loadFavors();
      if (cached) { setFavors(cached.filter((f) => f.type === selectedType && f.creator_id !== user?.user_id)); setNetworkError(false); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedType, location, token, user?.user_id]);

  useEffect(() => {
    getLocation();
    loadThanksBoard();
    loadUnreadCount();
    if (token) api.getUserSkills(token).then((result) => setMySkills(result.skills ?? [])).catch(() => setMySkills([]));
    // Poll notifications every 15 seconds for real-time updates
    const notifInterval = setInterval(loadUnreadCount, 15000);
    return () => clearInterval(notifInterval);
  }, [loadUnreadCount]);

  useEffect(() => {
    loadFavors();
  }, [loadFavors]);
  // Elenco dei favori aggiornato ogni 3 secondi mentre la scheda è in primo piano
  useLiveRefresh(loadFavors);


  const onRefresh = () => {
    setRefreshing(true);
    refreshUser();
    loadFavors();
    loadThanksBoard();
  };

  const visibleFavors = useMemo(() => filterFavors(favors, 'all', query), [favors, query]);
  // Con filtro o ricerca attivi l'elenco è unico; a fasce solo quando si guarda tutto
  const rows = useMemo(
    () => buildRows(visibleFavors, { grouped: query.trim() === '', expanded: expandedSections, skills: mySkills }),
    [visibleFavors, query, expandedSections, mySkills],
  );

  // «Aiuta un vicino» (Comincia da qui): scheda «Dona un favore» e poi giù fino ai favori, appena l'elenco è pronto
  const listRef = useRef<FlatList<(typeof rows)[number]>>(null);
  const [pendingGiveScroll, setPendingGiveScroll] = useState(false);
  const showGive = () => {
    setQuery('');
    setSelectedType('request');
    setPendingGiveScroll(true);
  };
  useEffect(() => {
    if (!pendingGiveScroll || loading || selectedType !== 'request') return;
    setPendingGiveScroll(false);
    if (rows.length === 0) {
      // Nessun favore qui vicino: la Mappa permette di allargare il raggio
      router.push('/(tabs)/map' as any);
      return;
    }
    listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
  }, [pendingGiveScroll, loading, selectedType, rows, router]);

  const toggleSection = (section: FavorSectionKey) =>
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });

  const SECTION_TITLES: Record<FavorSectionKey, string> = {
    near: 'Vicini a te',
    skills: 'In linea con le tue competenze',
    others: 'Altri favori',
  };

  const renderCard = (favor: Favor) => (
    <FavorCard
      lean
      item={favor}
      currentUserId={user?.user_id}
      onPress={(f) => router.push(`/favor/${f.favor_id}`)}
    />
  );

  const renderRow = ({ item }: { item: FavorRow }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {tt(SECTION_TITLES[item.section])} ({item.total})
          </Text>
          {item.canExpand && (
            <TouchableOpacity
              onPress={() => toggleSection(item.section)}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.sectionMore}>
                {item.expanded ? tt('Mostra meno') : tt('Vedi tutti')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    if (item.type === 'group') {
      const visual = getCategoryVisual(item.category);
      return (
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => setQuery(item.title)}
          accessibilityRole="button"
          accessibilityLabel={tx('{0} vicini chiedono: {1}', [item.count, item.title])}
          data-testid="favor-group-row"
        >
          <Text style={styles.groupEmoji}>{visual.emoji}</Text>
          <View style={styles.groupBody}>
            <Text style={styles.groupTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.groupSub}>
              {tx('{0} vicini lo chiedono', [item.count])}
              {item.nearestKm !== null ? ` · ${tt('il più vicino')} ${formatDistance(item.nearestKm)}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.pairRow}>
        {renderCard(item.left)}
        {item.right ? renderCard(item.right) : <View style={styles.pairSpacer} />}
      </View>
    );
  };


  // Intestazione e fondo dell'elenco: sono elementi, non componenti, così non si ricreano a ogni aggiornamento (evita il lampeggio)
  const listHeader = (
    <>
      {token && <FirstSteps token={token} helped={user?.total_favors_given ?? 0} onShowGive={showGive} />}

      <FavorTypeTabs value={selectedType} onChange={setSelectedType} hideHint />

      {widenedKm !== null && (
        <Text style={styles.widenedNote} data-testid="home-widened-note">
          {tx('Pochi favori vicino a te: ho allargato la ricerca a {0} km', [widenedKm])}
        </Text>
      )}

      {(favors.length >= 7 || query.length > 0) && (
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={tt('Cerca un favore')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          accessibilityLabel={tt('Cerca un favore')}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={tt('Cancella')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      )}
    </>
  );

  // In fondo all'elenco: i grazie recenti e un invito discreto a sostenere l'app
  const listFooter = (
    <View style={styles.homeFooter}>
      {thanksBoard.length > 0 && (
        <View style={styles.thanksPanel}>
          <View style={styles.thanksPanelHead}>
            <Ionicons name="heart" size={14} color={colors.accent} />
            <Text style={styles.sectionTitle}>{tt('Bacheca dei Grazie')}</Text>
          </View>
          {thanksBoard.slice(0, 3).map((entry, index) => (
            <View key={entry.thanks_id} style={[styles.thanksRow, index > 0 && styles.thanksRowDivider]}>
              <Text style={styles.thanksNames} numberOfLines={1}>
                {entry.giver_name}
                <Text style={styles.thanksArrowText}>{'  →  '}</Text>
                {entry.receiver_name}
              </Text>
              <Text style={styles.thanksQuote} numberOfLines={2}>{entry.message}</Text>
            </View>
          ))}
        </View>
      )}
      {SUPPORTER_PURCHASE_ENABLED && user && !user.is_supporter && (
        <TouchableOpacity
          onPress={() => router.push('/supporter')}
          accessibilityRole="button"
          data-testid="supporter-promo-banner"
        >
          <Text style={styles.supportLink}>{tt('💚 Sostieni l\'app con 1 € al mese')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Network Error Banner */}
      <NetworkErrorBanner 
        visible={networkError} 
        onRetry={onRefresh}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!isNarrowScreen && <Image source={require('../../assets/images/logo.png')} style={styles.headerLogo} resizeMode="contain" />}
          <View style={styles.headerGreeting}>
            <Text style={styles.greeting} numberOfLines={1}>{tt('Ciao,')}{' '}{user?.name?.trim().split(/\s+/)[0] ?? ''}!</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{t('home.subtitle')}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Notifications Bell */}
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
            hitSlop={hitSlopFor(36)}
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications > 0 ? tx('Notifiche, {0} non lette', [unreadNotifications]) : tt('Notifiche')}
            data-testid="notifications-button"
          >
            <Ionicons name="notifications" size={24} color={colors.textPrimary} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <MessagesButton size={36} />
          <NeighborhoodButton size={36} />
          {/* Granelli Display */}
          <View style={styles.soliDisplay}>
            <GranelloIcon size={18} />
            <Text style={styles.soliDisplayValue}>{user?.granelli || 0}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <FavorsGridSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          onScrollToIndexFailed={({ averageItemLength, index }) =>
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })}
          data={rows}
          renderItem={renderRow}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>{tt('Ancora nessun favore dei tuoi vicini')}</Text>
              <Text style={styles.emptySubtext}>{tt('Pubblica tu il primo da Crea: i tuoi vicini lo vedranno subito')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}

    </SafeAreaView>
  );
}
