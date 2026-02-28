import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Category, ThanksEntry, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import colors from '../../src/theme/colors';
import { ReportModal } from '../../src/components/ReportModal';
import { FavorsListSkeleton } from '../../src/components/Skeleton';
import { NetworkErrorBanner } from '../../src/components/OfflineNotice';
import { UserNameWithBadge, SupporterProfileBorder } from '../../src/components/SupporterBadge';

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
      console.log('Error loading notification count:', error);
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
      console.log('Error getting location:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      console.log('Error loading categories:', error);
    }
  };

  const loadThanksBoard = async () => {
    try {
      const data = await api.getThanksBoard(5);
      setThanksBoard(data);
    } catch (error) {
      console.log('Error loading thanks board:', error);
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
    } catch (error) {
      console.log('Error loading favors:', error);
      setNetworkError(true);
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

  // Refresh user data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadFavors();
      loadUnreadCount();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshUser();
    loadFavors();
    loadThanksBoard();
  };

  const renderThanksCard = ({ item }: { item: ThanksEntry }) => (
    <View style={styles.thanksCard}>
      <View style={styles.thanksHeader}>
        <Ionicons name="heart" size={12} color="#ff6b6b" />
        <Text style={styles.thanksGiver}>{item.giver_name}</Text>
        <Ionicons name="arrow-forward" size={10} color="#888" />
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
        <SupporterProfileBorder isSupporter={item.creator_is_supporter} size={28}>
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
            {item.type === 'offer' ? 'Offerta' : 'Richiesta'}
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
      <Text style={styles.favorDescription} numberOfLines={1}>{item.description}</Text>

      {/* Footer: Category + Emergency + Granelli */}
      <View style={styles.favorFooter}>
        <View style={styles.footerLeft}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
              size={10}
              color={colors.primaryLight}
            />
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          {item.is_emergency && (
            <View style={styles.emergencyBadge}>
              <Ionicons name="alert-circle" size={10} color={colors.error} />
              <Text style={styles.emergencyText}>Urgente</Text>
            </View>
          )}
        </View>
        <View style={styles.soliContainer}>
          <Text style={styles.soliSymbol}>{CURRENCY_SYMBOL}</Text>
          <Text style={styles.soliText}>{item.granelli_cost}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Header component for FlatList
  const ListHeader = () => (
    <>
      {/* Supporter Promo Banner OR Thanks Board */}
      {user && !user.is_supporter ? (
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
              <Text style={styles.promoBannerTitle}>Diventa Sostenitore!</Text>
              <Text style={styles.promoBannerSubtitle}>
                Solo 1€/mese per supportare la community e ottenere il badge dorato ✨
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFD700" />
          </View>
        </TouchableOpacity>
      ) : thanksBoard.length > 0 ? (
        <View style={styles.thanksBoardSection}>
          <View style={styles.thanksBoardHeader}>
            <Ionicons name="heart" size={18} color="#ff6b6b" />
            <Text style={styles.thanksBoardTitle}>Bacheca dei Grazie</Text>
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
              {type === 'all' ? 'Tutti' : type === 'offer' ? 'Offerte' : 'Richieste'}
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
            Tutti
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
              size={16}
              color={selectedCategory === cat.name ? '#1a1a2e' : '#4ecca3'}
            />
            <Text style={[styles.categoryChipText, selectedCategory === cat.name && styles.categoryChipTextActive]}>
              {cat.name}
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
        <View>
          <Text style={styles.greeting}>Ciao, {user?.name?.split(' ')[0]}!</Text>
          <Text style={styles.subtitle}>Trova favori nelle vicinanze</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Notifications Bell */}
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
            data-testid="notifications-button"
          >
            <Ionicons name="notifications" size={22} color={colors.textPrimary} />
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
              <Ionicons name="search" size={60} color="#333" />
              <Text style={styles.emptyText}>Nessun favore trovato</Text>
              <Text style={styles.emptySubtext}>Prova a cambiare i filtri</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ecca3" />
          }
        />
      )}

      {/* Emergency Button */}
      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={() => router.push('/emergencies' as any)}
      >
        <Ionicons name="alert-circle" size={24} color="#fff" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.accent,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: colors.background,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  soliDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  soliDisplaySymbol: {
    fontSize: 16,
  },
  soliDisplayValue: {
    color: colors.granelli,
    fontSize: 16,
    fontWeight: 'bold',
  },
  thanksBoardSection: {
    marginTop: 4,
    paddingBottom: 4,
  },
  thanksBoardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
    gap: 6,
  },
  thanksBoardTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  thanksBoardList: {
    paddingHorizontal: 16,
  },
  thanksCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    width: 180,
  },
  thanksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  thanksGiver: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
  },
  thanksArrow: {
    color: colors.textMuted,
    fontSize: 10,
  },
  thanksReceiver: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
  },
  thanksMessage: {
    color: colors.textSecondary,
    fontSize: 9,
    fontStyle: 'italic',
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.backgroundLight,
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  typeFilter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 10,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.backgroundLight,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  categoriesContainer: {
    marginTop: 10,
    marginBottom: 4,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    gap: 6,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.backgroundLight,
    gap: 5,
  },
  categoryChipActive: {
    backgroundColor: colors.accent,
  },
  categoryChipMicro: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  categoryChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  promoBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.granelliMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    overflow: 'hidden',
  },
  promoBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  promoBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoBannerText: {
    flex: 1,
  },
  promoBannerTitle: {
    color: colors.granelli,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  promoBannerSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 80,
  },
  favorCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  favorCardDebtHighlight: {
    borderWidth: 2,
    borderColor: colors.debt,
    backgroundColor: colors.backgroundLight,
  },
  favorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  headerContent: {
    flex: 1,
  },
  authorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInitial: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  reportButton: {
    padding: 4,
    borderRadius: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  categoryText: {
    color: colors.primaryLight,
    fontSize: 9,
    fontWeight: '600',
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.debtMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  emergencyText: {
    color: colors.error,
    fontSize: 9,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  offerBadge: {
    backgroundColor: colors.primaryMuted,
  },
  requestBadge: {
    backgroundColor: colors.accentMuted,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  favorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  favorDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  favorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  creatorName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  soliContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.granelliMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  soliSymbol: {
    fontSize: 12,
  },
  soliText: {
    color: colors.granelli,
    fontSize: 14,
    fontWeight: 'bold',
  },
  emergencyButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});
