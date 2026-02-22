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
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, LendableObject, ObjectCategory, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';

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
      console.log('Error getting location:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.getObjectCategories();
      setCategories(data);
    } catch (error) {
      console.log('Error loading categories:', error);
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
      console.log('Error loading objects:', error);
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
      console.log('Error loading my objects:', error);
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
    
    if ((user?.soli || 0) < depositSoli) {
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
          deposit_soli: parseInt(newObject.deposit_soli) || 2,
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
              color="#9c27b0"
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
            <Ionicons name="person-circle" size={18} color="#888" />
            <Text style={styles.ownerName}>
              {isMine ? 'Tu' : item.owner_name}
            </Text>
          </View>
          <View style={styles.depositContainer}>
            <Text style={styles.depositLabel}>Deposito:</Text>
            <Text style={styles.depositSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.depositValue}>{item.deposit_soli}</Text>
          </View>
        </View>

        {item.distance_km !== null && item.distance_km !== undefined && (
          <View style={styles.distanceContainer}>
            <Ionicons name="location" size={14} color="#9c27b0" />
            <Text style={styles.distanceText}>{item.distance_km} km</Text>
          </View>
        )}

        {/* Actions */}
        {item.status === 'available' && !isMine && (
          <TouchableOpacity
            style={styles.borrowButton}
            onPress={() => handleBorrow(item.object_id, item.deposit_soli)}
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
            color={activeTab === 'available' ? '#1a1a2e' : '#888'}
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
            color={activeTab === 'mine' ? '#1a1a2e' : '#888'}
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
                color={selectedCategory === cat.name ? '#1a1a2e' : '#9c27b0'}
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
          <ActivityIndicator size="large" color="#9c27b0" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'available' ? objects : myObjects}
          renderItem={renderObjectCard}
          keyExtractor={(item) => item.object_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9c27b0" />
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
                placeholderTextColor="#666"
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
                placeholderTextColor="#666"
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
                      color={newObject.category === cat.name ? '#1a1a2e' : '#9c27b0'}
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#9c27b0',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#9c27b0',
  },
  tabText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  categoriesContainer: {
    marginTop: 16,
    maxHeight: 50,
  },
  categoriesContent: {
    paddingHorizontal: 20,
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
    backgroundColor: '#9c27b0',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 14,
  },
  categoryChipTextActive: {
    color: '#fff',
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
  },
  objectCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  objectHeader: {
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
    color: '#9c27b0',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusAvailable: {
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
  },
  statusBorrowed: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  objectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  objectDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 12,
  },
  objectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    color: '#888',
    fontSize: 14,
  },
  depositContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  depositLabel: {
    color: '#666',
    fontSize: 12,
  },
  depositSymbol: {
    fontSize: 16,
  },
  depositValue: {
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
    color: '#9c27b0',
    fontSize: 12,
  },
  borrowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9c27b0',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  borrowButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  returnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ecca3',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  returnButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  categoryOptionActive: {
    backgroundColor: '#9c27b0',
  },
  categoryOptionText: {
    color: '#888',
    fontSize: 13,
  },
  categoryOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  depositInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  depositAdjust: {
    backgroundColor: '#1a1a2e',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  depositDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  depositDisplaySymbol: {
    fontSize: 28,
  },
  depositDisplayValue: {
    color: '#ffd700',
    fontSize: 32,
    fontWeight: 'bold',
  },
  depositHint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#888',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#888',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#9c27b0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});
