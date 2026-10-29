import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, LendableObject, ObjectCategory, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import { styles } from '../../src/styles/oggettoteca.styles';
import { logger } from '../../src/utils/logger';

const CATEGORY_ICONS: Record<string, string> = {
  'Utensili': 'hammer',
  'Cucina': 'restaurant',
  'Giardino': 'leaf',
  'Sport': 'football',
  'Elettronica': 'laptop',
  'Bambini': 'happy',
  'Fai da te': 'construct',
  'Altro': 'cube',
};

export default function OggettotecaScreen() {
  const { user, token, refreshUser } = useAuth();
  const [objects, setObjects] = useState<LendableObject[]>([]);
  const [myObjects, setMyObjects] = useState<LendableObject[]>([]);
  const [categories, setCategories] = useState<ObjectCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'available' | 'mine'>('available');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Add object form
  const [newObject, setNewObject] = useState({
    name: '',
    description: '',
    category: 'Utensili',
    deposit_soli: '2',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const data = await api.getObjectCategories();
      setCategories(data);
    } catch (error) {
      logger.debug('Error loading categories:', error);
    }
  };

  const loadObjects = useCallback(async () => {
    try {
      const params: any = { status: 'available' };
      if (selectedCategory) params.category = selectedCategory;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.max_distance_km = 10;
      }
      const data = await api.getObjects(params);
      setObjects(data);
    } catch (error) {
      logger.debug('Error loading objects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, location]);

  const loadMyObjects = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getMyObjects(token);
      setMyObjects(data);
    } catch (error) {
      logger.debug('Error loading my objects:', error);
    }
  }, [token]);

  useEffect(() => {
    getLocation();
    loadCategories();
  }, []);

  useEffect(() => {
    loadObjects();
    loadMyObjects();
  }, [loadObjects, loadMyObjects]);

  const onRefresh = () => {
    setRefreshing(true);
    loadObjects();
    loadMyObjects();
  };

  const handleBorrow = async (objectId: string, depositSoli: number) => {
    if (!token) return;
    
    if ((user?.granelli || 0) < depositSoli) {
      Alert.alert('Soli insufficienti', `Servono ${depositSoli} ${CURRENCY_NAME} come deposito`);
      return;
    }

    Alert.alert(
      'Conferma Prestito',
      `Verranno trattenuti ${depositSoli} ${CURRENCY_NAME} come deposito. Li riavrai quando restituirai l'oggetto in buone condizioni.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Prendi in Prestito',
          onPress: async () => {
            try {
              await api.borrowObject(objectId, token);
              await refreshUser();
              loadObjects();
              loadMyObjects();
              Alert.alert('Fatto!', 'Oggetto preso in prestito. Contatta il proprietario per il ritiro.');
            } catch (error: any) {
              Alert.alert('Errore', error.message);
            }
          },
        },
      ]
    );
  };

  const handleReturn = async (objectId: string) => {
    if (!token) return;

    Alert.alert(
      'Restituisci Oggetto',
      'In che condizioni è l\'oggetto?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Buone condizioni',
          onPress: async () => {
            try {
              await api.returnObject(objectId, 'good', token);
              await refreshUser();
              loadObjects();
              loadMyObjects();
              Alert.alert('Grazie!', 'Deposito restituito.');
            } catch (error: any) {
              Alert.alert('Errore', error.message);
            }
          },
        },
        {
          text: 'Danneggiato',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.returnObject(objectId, 'damaged', token);
              await refreshUser();
              loadObjects();
              loadMyObjects();
              Alert.alert('Restituito', 'Il deposito è stato trasferito al proprietario.');
            } catch (error: any) {
              Alert.alert('Errore', error.message);
            }
          },
        },
      ]
    );
  };

  const handleAddObject = async () => {
    if (!token) return;
    if (!newObject.name.trim()) {
      Alert.alert('Errore', 'Inserisci un nome');
      return;
    }
    if (!newObject.description.trim()) {
      Alert.alert('Errore', 'Inserisci una descrizione');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createObject(
        {
          name: newObject.name.trim(),
          description: newObject.description.trim(),
          category: newObject.category,
          deposit_granelli: parseInt(newObject.deposit_soli) || 2,
          latitude: location?.latitude,
          longitude: location?.longitude,
        },
        token
      );
      setShowAddModal(false);
      setNewObject({ name: '', description: '', category: 'Utensili', deposit_soli: '2' });
      loadObjects();
      loadMyObjects();
      Alert.alert('Fatto!', 'Oggetto aggiunto all\'Oggettoteca');
    } catch (error: any) {
      Alert.alert('Errore', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderObjectCard = ({ item }: { item: LendableObject }) => {
    const isMine = item.owner_id === user?.user_id;
    const isBorrowedByMe = item.borrowed_by === user?.user_id;

    return (
      <View style={styles.objectCard}>
        <View style={styles.objectHeader}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={(CATEGORY_ICONS[item.category] || 'cube') as any}
              size={16}
              color="#A8B858"
            />
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          <View style={[styles.statusBadge, 
            item.status === 'available' ? styles.statusAvailable : styles.statusBorrowed
          ]}>
            <Text style={styles.statusText}>
              {item.status === 'available' ? 'Disponibile' : 'In prestito'}
            </Text>
          </View>
        </View>

        <Text style={styles.objectName}>{item.name}</Text>
        <Text style={styles.objectDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.objectFooter}>
          <View style={styles.ownerInfo}>
            <Ionicons name="person-circle" size={18} color="#9DB3A4" />
            <Text style={styles.ownerName}>
              {isMine ? 'Tu' : item.owner_name}
            </Text>
          </View>
          <View style={styles.depositContainer}>
            <Text style={styles.depositLabel}>Deposito:</Text>
            <Text style={styles.depositSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.depositValue}>{item.deposit_granelli}</Text>
          </View>
        </View>

        {item.distance_km !== null && item.distance_km !== undefined && (
          <View style={styles.distanceContainer}>
            <Ionicons name="location" size={14} color="#A8B858" />
            <Text style={styles.distanceText}>{item.distance_km} km</Text>
          </View>
        )}

        {/* Actions */}
        {item.status === 'available' && !isMine && (
          <TouchableOpacity
            style={styles.borrowButton}
            onPress={() => handleBorrow(item.object_id, item.deposit_granelli)}
          >
            <Ionicons name="hand-left" size={18} color="#fff" />
            <Text style={styles.borrowButtonText}>Prendi in Prestito</Text>
          </TouchableOpacity>
        )}

        {isBorrowedByMe && (
          <TouchableOpacity
            style={styles.returnButton}
            onPress={() => handleReturn(item.object_id)}
          >
            <Ionicons name="return-down-back" size={18} color="#fff" />
            <Text style={styles.returnButtonText}>Restituisci</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Oggettoteca</Text>
          <Text style={styles.subtitle}>Presta e prendi in prestito oggetti</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Ionicons
            name="cube"
            size={18}
            color={activeTab === 'available' ? '#0F1A14' : '#9DB3A4'}
          />
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Disponibili
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mine' && styles.tabActive]}
          onPress={() => setActiveTab('mine')}
        >
          <Ionicons
            name="person"
            size={18}
            color={activeTab === 'mine' ? '#0F1A14' : '#9DB3A4'}
          />
          <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextActive]}>
            I Miei Oggetti
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'available' && (
        /* Categories */
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
                name={(CATEGORY_ICONS[cat.name] || 'cube') as any}
                size={16}
                color={selectedCategory === cat.name ? '#0F1A14' : '#A8B858'}
              />
              <Text style={[styles.categoryChipText, selectedCategory === cat.name && styles.categoryChipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A8B858" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'available' ? objects : myObjects}
          renderItem={renderObjectCard}
          keyExtractor={(item) => item.object_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A8B858" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={60} color="#333" />
              <Text style={styles.emptyText}>
                {activeTab === 'available' 
                  ? 'Nessun oggetto disponibile' 
                  : 'Non hai ancora aggiunto oggetti'}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'available' 
                  ? 'Prova a cambiare categoria' 
                  : 'Aggiungi il primo oggetto!'}
              </Text>
            </View>
          }
        />
      )}

      {/* Add Object Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aggiungi Oggetto</Text>
            <Text style={styles.modalSubtitle}>
              Condividi un oggetto con il tuo quartiere
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome</Text>
              <TextInput
                style={styles.input}
                placeholder="Es: Trapano elettrico"
                placeholderTextColor="#8FA595"
                value={newObject.name}
                onChangeText={(text) => setNewObject({ ...newObject, name: text })}
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Descrizione</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Descrivi l'oggetto..."
                placeholderTextColor="#8FA595"
                value={newObject.description}
                onChangeText={(text) => setNewObject({ ...newObject, description: text })}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.name}
                    style={[
                      styles.categoryOption,
                      newObject.category === cat.name && styles.categoryOptionActive,
                    ]}
                    onPress={() => setNewObject({ ...newObject, category: cat.name })}
                  >
                    <Ionicons
                      name={(CATEGORY_ICONS[cat.name] || 'cube') as any}
                      size={16}
                      color={newObject.category === cat.name ? '#0F1A14' : '#A8B858'}
                    />
                    <Text style={[
                      styles.categoryOptionText,
                      newObject.category === cat.name && styles.categoryOptionTextActive,
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Deposito ({CURRENCY_NAME})</Text>
              <View style={styles.depositInput}>
                <TouchableOpacity
                  style={styles.depositAdjust}
                  onPress={() => setNewObject({ 
                    ...newObject, 
                    deposit_soli: String(Math.max(1, parseInt(newObject.deposit_soli) - 1)) 
                  })}
                >
                  <Ionicons name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.depositDisplay}>
                  <Text style={styles.depositDisplaySymbol}>{CURRENCY_SYMBOL}</Text>
                  <Text style={styles.depositDisplayValue}>{newObject.deposit_soli}</Text>
                </View>
                <TouchableOpacity
                  style={styles.depositAdjust}
                  onPress={() => setNewObject({ 
                    ...newObject, 
                    deposit_soli: String(parseInt(newObject.deposit_soli) + 1) 
                  })}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.depositHint}>
                Il deposito garantisce la cura dell'oggetto
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleAddObject}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={styles.modalConfirmText}>Aggiungi</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
