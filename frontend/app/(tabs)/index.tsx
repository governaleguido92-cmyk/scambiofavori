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
  const { user, token } = useAuth();
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

  const onRefresh = () => {
    setRefreshing(true);
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
      {/* Debt Priority Badge */}
      {item.creator_in_debt && item.type === 'offer' && (
        <View style={styles.debtPriorityBadge}>
          <Ionicons name="heart" size={12} color={colors.debt} />
          <Text style={styles.debtPriorityText}>Aiutalo a tornare in positivo!</Text>
        </View>
      )}

      {/* Modern Header with Category Icon and Author */}
      <View style={styles.favorHeader}>
        <View style={styles.categoryIconContainer}>
          <Ionicons
            name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
            size={24}
            color={colors.primary}
          />
        </View>
        <View style={styles.headerContent}>
          <View style={styles.authorRow}>
            <SupporterProfileBorder isSupporter={item.creator_is_supporter} size={32}>
              <View style={styles.authorAvatar}>
                <Text style={styles.authorInitial}>{item.creator_name.charAt(0).toUpperCase()}</Text>
              </View>
            </SupporterProfileBorder>
            <View style={styles.authorInfo}>
              <UserNameWithBadge 
                name={item.creator_name} 
                isSupporter={item.creator_is_supporter}
                nameStyle={styles.creatorName}
              />
              <Text style={styles.creatorTitle}>{item.creator_title || 'Nuovo Vicino'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.typeBadge, item.type === 'offer' ? styles.offerBadge : styles.requestBadge]}>
            <Text style={styles.typeText}>
              {item.type === 'offer' ? 'Offerta' : 'Richiesta'}
            </Text>
          </View>
          {/* Report Button */}
          {item.creator_id !== user?.user_id && (
            <TouchableOpacity
              style={styles.reportButton}
              onPress={(e) => {
                e.stopPropagation();
                handleReportFavor(item.favor_id, item.title);
              }}
              data-testid={`report-favor-${item.favor_id}`}
            >
              <Ionicons name="flag-outline" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Title and Description */}
      <Text style={styles.favorTitle}>{item.title}</Text>
      <Text style={styles.favorDescription} numberOfLines={2}>
        {item.description}
      </Text>

      {/* Badges Row */}
      <View style={styles.badgesRow}>
        <View style={styles.categoryBadge}>
          <Ionicons
            name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
            size={12}
            color={colors.primary}
          />
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
        {item.is_emergency && (
          <View style={styles.emergencyBadge}>
            <Ionicons name="alert-circle" size={12} color={colors.error} />
            <Text style={styles.emergencyText}>Urgente</Text>
          </View>
        )}
      </View>

      {/* Footer with Granelli */}
      <View style={styles.favorFooter}>
        <View style={styles.soliContainer}>
          <Text style={styles.soliSymbol}>{CURRENCY_SYMBOL}</Text>
          <Text style={styles.soliText}>{item.granelli_cost}</Text>
          <Text style={styles.soliLabel}>{CURRENCY_NAME}</Text>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.accent,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  notificationBadgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: 'bold',
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  soliDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  soliDisplaySymbol: {
    fontSize: 20,
  },
  soliDisplayValue: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  thanksBoardSection: {
    marginTop: 4,
    paddingBottom: 4,
  },
  thanksBoardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
    gap: 6,
  },
  thanksBoardTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  thanksBoardList: {
    paddingHorizontal: 20,
  },
  thanksCard: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 8,
    marginRight: 8,
    width: 200,
  },
  thanksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  thanksGiver: {
    color: '#4ecca3',
    fontSize: 11,
    fontWeight: '600',
  },
  thanksArrow: {
    color: '#888',
    fontSize: 10,
  },
  thanksReceiver: {
    color: '#4ecca3',
    fontSize: 11,
    fontWeight: '600',
  },
  thanksMessage: {
    color: '#aaa',
    fontSize: 10,
    fontStyle: 'italic',
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#4ecca3',
  },
  tabText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#1a1a2e',
  },
  typeFilter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },
  typeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#16213e',
  },
  typeButtonActive: {
    backgroundColor: '#4ecca3',
  },
  typeButtonText: {
    color: '#888',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#1a1a2e',
  },
  categoriesContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    gap: 10,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1E3A2F',
    gap: 8,
    minHeight: 40,
  },
  categoryChipActive: {
    backgroundColor: '#4ecca3',
  },
  categoryChipMicro: {
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  categoryChipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#0F1A14',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  promoBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    overflow: 'hidden',
  },
  promoBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  promoBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoBannerText: {
    flex: 1,
  },
  promoBannerTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  promoBannerSubtitle: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  listContent: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 100,  // Extra space for emergency button
  },
  favorCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  favorCardDebtHighlight: {
    borderWidth: 2,
    borderColor: colors.debt,
    backgroundColor: colors.backgroundLight,
  },
  debtPriorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.debtMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10,
    gap: 6,
  },
  debtPriorityText: {
    color: colors.debt,
    fontSize: 11,
    fontWeight: '600',
  },
  favorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  authorInfo: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#16213e',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  categoryText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.debtMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  emergencyText: {
    color: colors.error,
    fontSize: 10,
    fontWeight: '600',
  },
  microBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  microText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  offerBadge: {
    backgroundColor: colors.primaryMuted,
  },
  requestBadge: {
    backgroundColor: colors.accentMuted,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  favorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  favorDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  favorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  creatorName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  creatorTitle: {
    color: colors.textMuted,
    fontSize: 10,
  },
  soliContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  soliSymbol: {
    fontSize: 16,
  },
  soliText: {
    color: colors.granelli,
    fontSize: 16,
    fontWeight: 'bold',
  },
  soliLabel: {
    color: colors.textMuted,
    fontSize: 10,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '500',
  },
  wallPostCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  wallPostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  wallPostAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wallPostAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wallPostAvatarText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  wallPostAuthorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  wallPostAuthorTitle: {
    color: '#888',
    fontSize: 12,
  },
  thanksTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  thanksTypeText: {
    color: '#ff6b6b',
    fontSize: 11,
    fontWeight: '600',
  },
  wallPostContent: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  wallPostFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  wallPostLikes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wallPostLikesText: {
    color: '#888',
    fontSize: 14,
  },
  wallPostDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wallPostDistanceText: {
    color: '#888',
    fontSize: 12,
  },
  emergencyButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
