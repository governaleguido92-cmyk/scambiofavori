import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Category, ThanksEntry, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import colors from '../../src/theme/colors';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { ReportModal } from '../../src/components/ReportModal';
import { FavorsListSkeleton } from '../../src/components/Skeleton';
import { NetworkErrorBanner } from '../../src/components/OfflineNotice';
import { offlineCache } from '../../src/utils/offlineCache';
import { UserNameWithBadge, SupporterProfileBorder } from '../../src/components/SupporterBadge';
import { useTranslation } from 'react-i18next';
import { styles } from '../../src/styles/home.styles';
import { logger } from '../../src/utils/logger';
import { tt, tx } from '../../src/i18n/tt';

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

// The shown position is intentionally blurred, so the distance is rounded up.
const formatDistance = (km: number): string =>
  km < 1 ? tt('meno di 1 km') : tx('circa {0} km', [Math.ceil(km)]);

export default function HomeScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [thanksBoard, setThanksBoard] = useState<ThanksEntry[]>([]);
  const [networkError, setNetworkError] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);

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

  const handleReportFavor = (favorId: string, favorTitle: string) => {
    setReportTarget({ id: favorId, name: favorTitle });
    setReportModalVisible(true);
  };

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
      const data = await api.getThanksBoard(5);
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
      if (selectedType !== 'all') params.type = selectedType;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = 10;
      }
      const data = await api.getFavors(params);
      setFavors(data);
      await offlineCache.saveFavors(data);
    } catch (error) {
      logger.debug('Error loading favors:', error);
      setNetworkError(true);
      const cached = await offlineCache.loadFavors();
      if (cached) { setFavors(cached); setNetworkError(false); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedType, location]);

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
    // Poll favors every 20 seconds for real-time updates
    const favorsInterval = setInterval(loadFavors, 20000);
    return () => clearInterval(favorsInterval);
  }, [loadFavors]);

  const onRefresh = () => {
    setRefreshing(true);
    refreshUser();
    loadFavors();
    loadThanksBoard();
  };

  const renderThanksCard = ({ item }: { item: ThanksEntry }) => (
    <View style={styles.thanksCard}>
      <View style={styles.thanksHeader}>
        <Ionicons name="heart" size={14} color="#ff6b6b" />
        <Text style={styles.thanksGiver}>{item.giver_name}</Text>
        <Ionicons name="arrow-forward" size={14} color="#9DB3A4" />
        <Text style={styles.thanksReceiver}>{item.receiver_name}</Text>
      </View>
      <Text style={styles.thanksMessage} numberOfLines={1}>"{item.message}"</Text>
    </View>
  );

  const renderFavorCard = ({ item }: { item: Favor }) => (
    <TouchableOpacity
      style={[
        styles.favorCard,
        item.creator_in_debt && item.type === 'offer' && styles.favorCardDebtHighlight
      ]}
      onPress={() => router.push(`/favor/${item.favor_id}`)}
      data-testid={`favor-card-${item.favor_id}`}
    >
      {/* Compact Header: Avatar + Name + Type Badge */}
      <View style={styles.favorHeader}>
        <SupporterProfileBorder isSupporter={item.creator_is_supporter} size={32}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorInitial}>{item.creator_name.charAt(0).toUpperCase()}</Text>
          </View>
        </SupporterProfileBorder>
        <View style={styles.headerContent}>
          <UserNameWithBadge 
            name={item.creator_name} 
            isSupporter={item.creator_is_supporter}
            nameStyle={styles.creatorName}
          />
        </View>
        <View style={[styles.typeBadge, item.type === 'offer' ? styles.offerBadge : styles.requestBadge]}>
          <Text style={styles.typeText}>
            {item.type === 'offer' ? t('favor.offer') : t('favor.request')}
          </Text>
        </View>
        {item.creator_id !== user?.user_id && (
          <TouchableOpacity
            style={styles.reportButton}
            onPress={(e) => {
              e.stopPropagation();
              handleReportFavor(item.favor_id, item.title);
            }}
            data-testid={`report-favor-${item.favor_id}`}
          >
            <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Title */}
      <Text style={styles.favorTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.favorDescription} numberOfLines={2}>{item.description}</Text>

      {/* Footer: Category + Emergency + Granelli */}
      <View style={styles.favorFooter}>
        <View style={styles.footerLeft}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
              size={14}
              color={colors.lime}
            />
            <Text style={styles.categoryText}>{tt(item.category)}</Text>
          </View>
          {item.is_emergency && (
            <View style={styles.emergencyBadge}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.emergencyText}>{tt('Urgente')}</Text>
            </View>
          )}
        </View>
        <View style={styles.footerRight}>
          {typeof item.distance_km === 'number' && (
            <Text style={styles.distanceText}>{formatDistance(item.distance_km)}</Text>
          )}
          <View style={styles.soliContainer}>
            <Text style={styles.soliSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.soliText}>{item.granelli_cost}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

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
              <Ionicons name="heart" size={24} color="#FFD700" />
            </View>
            <View style={styles.promoBannerText}>
              <Text style={styles.promoBannerTitle}>{tt('Diventa Sostenitore!')}</Text>
              <Text style={styles.promoBannerSubtitle}>{tt('Solo 1€/mese per supportare la community e ottenere il badge dorato ✨')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFD700" />
          </View>
        </TouchableOpacity>
      ) : thanksBoard.length > 0 ? (
        <View style={styles.thanksBoardSection}>
          <View style={styles.thanksBoardHeader}>
            <Ionicons name="heart" size={20} color="#ff6b6b" />
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

      {/* Type Filter */}
      <View style={styles.typeFilter}>
        {['all', 'offer', 'request'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeButton, selectedType === type && styles.typeButtonActive]}
            onPress={() => setSelectedType(type)}
          >
            <Text style={[styles.typeButtonText, selectedType === type && styles.typeButtonTextActive]}>
              {type === 'all' ? t('common.all') : type === 'offer' ? t('home.offers') : t('home.requests')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
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
            onPress={() => setSelectedCategory(cat.name)}
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
          {/* Granelli Display */}
          <View style={styles.soliDisplay}>
            <Text style={styles.soliDisplaySymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.soliDisplayValue}>{user?.granelli || 0}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <FavorsListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={favors}
          renderItem={renderFavorCard}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={64} color="#333" />
              <Text style={styles.emptyText}>{t('home.noFavors')}</Text>
              <Text style={styles.emptySubtext}>{tt('Prova a cambiare i filtri')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B8C868" />
          }
        />
      )}

      {/* Emergency Button */}
      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={() => router.push('/emergencies' as any)}
      >
        <Ionicons name="alert-circle" size={24} color="#fff" />
        <Text style={styles.emergencyButtonText}>{tt('Urgenze')}</Text>
      </TouchableOpacity>

      {/* Report Modal */}
      {reportTarget && token && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setReportTarget(null);
          }}
          reportType="favor"
          targetId={reportTarget.id}
          targetName={reportTarget.name}
          token={token}
        />
      )}
    </SafeAreaView>
  );
}
