import { NeighborhoodButton } from '../../src/components/NeighborhoodButton';
import { GranelloIcon } from '../../src/components/GranelloIcon';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Category, ThanksEntry } from '../../src/services/api';
import colors from '../../src/theme/colors';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { MessagesButton } from '../../src/components/MessagesButton';
import { FavorsGridSkeleton } from '../../src/components/Skeleton';
import { NetworkErrorBanner } from '../../src/components/OfflineNotice';
import { offlineCache } from '../../src/utils/offlineCache';
import { useTranslation } from 'react-i18next';
import { styles } from '../../src/styles/home.styles';
import { logger } from '../../src/utils/logger';
import { tt } from '../../src/i18n/tt';
import { FavorCard } from '../../src/components/FavorCard';
import { FavorTypeTabs, FavorType } from '../../src/components/FavorTypeTabs';
import { buildRows, filterFavors, FavorFilter, FavorRow, FavorSectionKey } from '../../src/utils/favorSections';

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'heart-circle',
  'Spesa': 'heart',
  'Tecnologia': 'heart-half',
  'Pulizie': 'home',
  'Compagnia': 'people',
  'Cucina': 'heart-circle-outline',
  'Giardinaggio': 'leaf',
  'Consiglio': 'chatbubble-ellipses',
  'Informazione': 'hand-left',
  'Aiuto Rapido': 'heart-sharp',
  'Altro': 'heart-outline',
};

export default function HomeScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<FavorType>('request');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [thanksBoard, setThanksBoard] = useState<ThanksEntry[]>([]);
  const [networkError, setNetworkError] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [filter, setFilter] = useState<FavorFilter>('all');
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

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      logger.debug('Error loading categories:', error);
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
      if (selectedCategory) params.category = selectedCategory;
      params.type = selectedType;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = 10;
      }
      const data = await api.getFavors(params, token || undefined);
      // I favori che hai pubblicato tu stanno in "I Miei": qui si vedono solo quelli degli altri.
      setFavors(data.filter((f) => f.creator_id !== user?.user_id));
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
  }, [selectedCategory, selectedType, location, token, user?.user_id]);

  useEffect(() => {
    getLocation();
    loadCategories();
    loadThanksBoard();
    loadUnreadCount();
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

  const renderThanksCard = ({ item }: { item: ThanksEntry }) => (
    <View style={styles.thanksCard}>
      <View style={styles.thanksHeader}>
        <Ionicons name="heart" size={14} color="#F87828" />
        <Text style={styles.thanksGiver}>{item.giver_name}</Text>
        <Ionicons name="arrow-forward" size={14} color="#A5A89B" />
        <Text style={styles.thanksReceiver}>{item.receiver_name}</Text>
      </View>
      <Text style={styles.thanksMessage} numberOfLines={1}>{`"${item.message}"`}</Text>
    </View>
  );

  const visibleFavors = useMemo(() => filterFavors(favors, filter, query), [favors, filter, query]);
  // Con filtro o ricerca attivi l'elenco è unico; a fasce solo quando si guarda tutto
  const rows = useMemo(
    () => buildRows(visibleFavors, { grouped: filter === 'all' && query.trim() === '', expanded: expandedSections }),
    [visibleFavors, filter, query, expandedSections],
  );

  const toggleSection = (section: FavorSectionKey) =>
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });

  const SECTION_TITLES: Record<FavorSectionKey, string> = {
    urgent: 'Urgenti',
    near: 'Vicini a te',
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
          <Text style={[styles.sectionTitle, item.section === 'urgent' && styles.sectionTitleUrgent]}>
            {tt(SECTION_TITLES[item.section])} ({item.total})
          </Text>
          {item.canExpand && (
            <TouchableOpacity
              onPress={() => toggleSection(item.section)}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.sectionMore}>{item.expanded ? tt('Mostra meno') : tt('Vedi tutti')}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return (
      <View style={styles.pairRow}>
        {renderCard(item.left)}
        {item.right ? renderCard(item.right) : <View style={styles.pairSpacer} />}
      </View>
    );
  };

  const FILTERS: { key: FavorFilter; label: string }[] = [
    { key: 'all', label: 'Tutti' },
    { key: 'near', label: 'Vicini' },
    { key: 'soon', label: 'Scade presto' },
  ];

  // Header component for FlatList
  const ListHeader = () => (
    <>
      {/* Supporter Promo Banner OR Thanks Board */}
      {SUPPORTER_PURCHASE_ENABLED && user && !user.is_supporter ? (
        <TouchableOpacity 
          style={styles.promoBanner}
          onPress={() => router.push('/supporter')}
          data-testid="supporter-promo-banner"
        >
          <View style={styles.promoBannerContent}>
            <View style={styles.promoBannerIcon}>
              <Ionicons name="heart" size={24} color="#98AA4A" />
            </View>
            <View style={styles.promoBannerText}>
              <Text style={styles.promoBannerTitle}>{tt('Diventa Sostenitore!')}</Text>
              <Text style={styles.promoBannerSubtitle}>{tt('Solo 1€/mese per supportare la community e ottenere il badge dorato ✨')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#98AA4A" />
          </View>
        </TouchableOpacity>
      ) : thanksBoard.length > 0 ? (
        <View style={styles.thanksBoardSection}>
          <View style={styles.thanksBoardHeader}>
            <Ionicons name="heart" size={20} color="#F87828" />
            <Text style={styles.thanksBoardTitle}>{tt('Bacheca dei Grazie')}</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={thanksBoard}
            renderItem={renderThanksCard}
            keyExtractor={(item) => item.thanks_id}
            contentContainerStyle={styles.thanksBoardList}
          />
        </View>
      ) : null}

      <FavorTypeTabs value={selectedType} onChange={setSelectedType} />

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

      <View style={styles.filterRow}>
        {FILTERS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterPill, filter === option.key && styles.filterPillActive]}
            onPress={() => setFilter(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === option.key }}
          >
            <Text style={[styles.filterPillText, filter === option.key && styles.filterPillTextActive]}>{tt(option.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Categorie: chiuse di default, si aprono con un tocco */}
      <TouchableOpacity
        style={styles.categoriesToggle}
        onPress={() => setCategoriesOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: categoriesOpen }}
      >
        <Text style={styles.categoriesToggleText}>
          {tt('Categoria')}: {selectedCategory ? tt(selectedCategory) : t('common.all')}
        </Text>
        <Ionicons name={categoriesOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </TouchableOpacity>
      {categoriesOpen && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
        >
          <TouchableOpacity
            style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
            onPress={() => { setSelectedCategory(null); setCategoriesOpen(false); }}
          >
            <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
              {t('common.all')}
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.name}
              style={[
                styles.categoryChip,
                selectedCategory === cat.name && styles.categoryChipActive,
              ]}
              onPress={() => { setSelectedCategory(cat.name); setCategoriesOpen(false); }}
            >
              <Ionicons
                name={(CATEGORY_ICONS[cat.name] || 'ellipsis-horizontal') as any}
                size={14}
                color={selectedCategory === cat.name ? colors.textPrimary : colors.lime}
              />
              <Text style={[styles.categoryChipText, selectedCategory === cat.name && styles.categoryChipTextActive]}>
                {tt(cat.name)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
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
          <Image source={require('../../assets/images/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <View>
            <Text style={styles.greeting}>{tt('Ciao,')}{' '}{user?.name?.trim().split(/\s+/)[0] ?? ''}!</Text>
            <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Notifications Bell */}
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
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
          data={rows}
          renderItem={renderRow}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={64} color="#333" />
              <Text style={styles.emptyText}>{tt('Ancora nessun favore dei tuoi vicini')}</Text>
              <Text style={styles.emptySubtext}>{tt('Pubblica tu il primo da Crea, oppure cambia i filtri')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#98AA4A" />
          }
        />
      )}

      {/* Emergency Button */}
      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={() => router.push('/emergencies' as any)}
      >
        <Ionicons name="alert-circle" size={24} color="#0C0E09" />
        <Text style={styles.emergencyButtonText}>{tt('Urgenze')}</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}
