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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Category } from '../../src/services/api';

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'car',
  'Spesa': 'cart',
  'Tecnologia': 'laptop',
  'Pulizie': 'water',
  'Compagnia': 'people',
  'Cucina': 'restaurant',
  'Giardinaggio': 'leaf',
  'Altro': 'ellipsis-horizontal',
};

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

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

  const loadFavors = useCallback(async () => {
    try {
      const params: any = { status: 'active' };
      if (selectedCategory) params.category = selectedCategory;
      if (selectedType !== 'all') params.type = selectedType;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = 50;
      }
      const data = await api.getFavors(params);
      setFavors(data);
    } catch (error) {
      console.log('Error loading favors:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedType, location]);

  useEffect(() => {
    getLocation();
    loadCategories();
  }, []);

  useEffect(() => {
    loadFavors();
  }, [loadFavors]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFavors();
  };

  const renderFavorCard = ({ item }: { item: Favor }) => (
    <TouchableOpacity
      style={styles.favorCard}
      onPress={() => router.push(`/favor/${item.favor_id}`)}
    >
      <View style={styles.favorHeader}>
        <View style={styles.categoryBadge}>
          <Ionicons
            name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
            size={16}
            color="#4ecca3"
          />
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
        <View style={[styles.typeBadge, item.type === 'offer' ? styles.offerBadge : styles.requestBadge]}>
          <Text style={styles.typeText}>
            {item.type === 'offer' ? 'Offerta' : 'Richiesta'}
          </Text>
        </View>
      </View>

      <Text style={styles.favorTitle}>{item.title}</Text>
      <Text style={styles.favorDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.favorFooter}>
        <View style={styles.creatorInfo}>
          <Ionicons name="person-circle" size={20} color="#888" />
          <Text style={styles.creatorName}>{item.creator_name}</Text>
        </View>
        <View style={styles.creditsContainer}>
          <Ionicons name="star" size={16} color="#ffd700" />
          <Text style={styles.creditsText}>{item.credits_cost}</Text>
        </View>
      </View>

      {item.distance_km !== null && item.distance_km !== undefined && (
        <View style={styles.distanceContainer}>
          <Ionicons name="location" size={14} color="#4ecca3" />
          <Text style={styles.distanceText}>{item.distance_km} km</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ciao, {user?.name?.split(' ')[0]}!</Text>
          <Text style={styles.subtitle}>Trova favori nelle vicinanze</Text>
        </View>
        <View style={styles.creditsDisplay}>
          <Ionicons name="star" size={20} color="#ffd700" />
          <Text style={styles.creditsValue}>{user?.credits || 0}</Text>
        </View>
      </View>

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
            style={[styles.categoryChip, selectedCategory === cat.name && styles.categoryChipActive]}
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      ) : favors.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={60} color="#333" />
          <Text style={styles.emptyText}>Nessun favore trovato</Text>
          <Text style={styles.emptySubtext}>Prova a cambiare i filtri</Text>
        </View>
      ) : (
        <FlatList
          data={favors}
          renderItem={renderFavorCard}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ecca3" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
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
  creditsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  creditsValue: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
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
    maxHeight: 50,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#16213e',
    gap: 6,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#4ecca3',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 14,
  },
  categoryChipTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  favorCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  favorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryText: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offerBadge: {
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
  },
  requestBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  favorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  favorDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 12,
  },
  favorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorName: {
    color: '#888',
    fontSize: 14,
  },
  creditsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creditsText: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  distanceText: {
    color: '#4ecca3',
    fontSize: 12,
  },
});
