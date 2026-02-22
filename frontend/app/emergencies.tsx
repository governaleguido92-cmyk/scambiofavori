import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../src/context/AuthContext';
import { api, Favor, CURRENCY_NAME, CURRENCY_SYMBOL } from '../src/services/api';

export default function EmergenciesScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const [emergencies, setEmergencies] = useState<Favor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create emergency form
  const [newEmergency, setNewEmergency] = useState({
    title: '',
    description: '',
  });

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

  const loadEmergencies = useCallback(async () => {
    if (!token || !location) return;
    try {
      const data = await api.getEmergencies(location.latitude, location.longitude, token);
      setEmergencies(data);
    } catch (error) {
      console.log('Error loading emergencies:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, location]);

  useEffect(() => {
    getLocation();
  }, []);

  useEffect(() => {
    if (location && token) {
      loadEmergencies();
    }
  }, [location, token, loadEmergencies]);

  const onRefresh = () => {
    setRefreshing(true);
    loadEmergencies();
  };

  const handleAcceptEmergency = async (favorId: string) => {
    if (!token) return;
    
    Alert.alert(
      'Aiuta questa persona',
      'Sei sicuro di voler rispondere a questa emergenza di gentilezza?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sì, aiuto!',
          onPress: async () => {
            try {
              await api.acceptFavor(favorId, token);
              loadEmergencies();
              Alert.alert('Grazie!', 'Hai risposto all\'emergenza. Contatta la persona per aiutarla.');
              router.push(`/favor/${favorId}` as any);
            } catch (error: any) {
              Alert.alert('Errore', error.message);
            }
          },
        },
      ]
    );
  };

  const handleCreateEmergency = async () => {
    if (!token || !location) return;
    if (!newEmergency.title.trim()) {
      Alert.alert('Errore', 'Inserisci un titolo');
      return;
    }
    if (!newEmergency.description.trim()) {
      Alert.alert('Errore', 'Descrivi la tua emergenza');
      return;
    }

    setIsSubmitting(true);
    try {
      const favor = await api.createFavor(
        {
          type: 'request',
          title: newEmergency.title.trim(),
          description: newEmergency.description.trim(),
          category: 'Aiuto Rapido',
          duration_hours: 1,
          latitude: location.latitude,
          longitude: location.longitude,
          is_micro: true,
          is_emergency: true,
        },
        token
      );
      await refreshUser();
      setShowCreateModal(false);
      setNewEmergency({ title: '', description: '' });
      Alert.alert(
        'Emergenza Inviata!',
        'Le persone vicine a te saranno notificate. Qualcuno ti aiuterà presto!',
        [
          { text: 'OK', onPress: () => router.push(`/favor/${favor.favor_id}` as any) }
        ]
      );
    } catch (error: any) {
      Alert.alert('Errore', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderEmergencyCard = ({ item }: { item: Favor }) => (
    <View style={styles.emergencyCard}>
      <View style={styles.emergencyHeader}>
        <View style={styles.urgentBadge}>
          <Ionicons name="alert-circle" size={16} color="#ff6b6b" />
          <Text style={styles.urgentText}>URGENTE</Text>
        </View>
        {item.distance_km !== undefined && (
          <View style={styles.distanceBadge}>
            <Ionicons name="location" size={14} color="#4ecca3" />
            <Text style={styles.distanceText}>{item.distance_km} km</Text>
          </View>
        )}
      </View>

      <Text style={styles.emergencyTitle}>{item.title}</Text>
      <Text style={styles.emergencyDescription}>{item.description}</Text>

      <View style={styles.creatorInfo}>
        <View style={styles.creatorAvatar}>
          <Text style={styles.creatorAvatarText}>
            {item.creator_name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <View>
          <Text style={styles.creatorName}>{item.creator_name}</Text>
          <Text style={styles.creatorTitle}>{item.creator_title}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.helpButton}
        onPress={() => handleAcceptEmergency(item.favor_id)}
      >
        <Ionicons name="heart" size={20} color="#fff" />
        <Text style={styles.helpButtonText}>Voglio Aiutare</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Emergenze Gentilezza</Text>
          <Text style={styles.subtitle}>Aiuta chi ha bisogno vicino a te</Text>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#4ecca3" />
        <Text style={styles.infoBannerText}>
          Le emergenze sono richieste urgenti inviate a vicini affidabili e valutati positivamente.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
        </View>
      ) : emergencies.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={60} color="#4ecca3" />
          </View>
          <Text style={styles.emptyText}>Nessuna emergenza nelle vicinanze</Text>
          <Text style={styles.emptySubtext}>
            Il quartiere è tranquillo! Ma se hai bisogno, puoi sempre chiedere aiuto.
          </Text>
        </View>
      ) : (
        <FlatList
          data={emergencies}
          renderItem={renderEmergencyCard}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff6b6b" />
          }
        />
      )}

      {/* Create Emergency Button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.createButtonText}>Ho bisogno di aiuto</Text>
      </TouchableOpacity>

      {/* Create Emergency Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={32} color="#ff6b6b" />
              <Text style={styles.modalTitle}>Emergenza Gentilezza</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Le persone affidabili vicino a te riceveranno una notifica
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Di cosa hai bisogno?</Text>
              <TextInput
                style={styles.input}
                placeholder="Es: Aiuto urgente con..."
                placeholderTextColor="#666"
                value={newEmergency.title}
                onChangeText={(text) => setNewEmergency({ ...newEmergency, title: text })}
                maxLength={60}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Descrivi la situazione</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Spiega brevemente cosa ti serve..."
                placeholderTextColor="#666"
                value={newEmergency.description}
                onChangeText={(text) => setNewEmergency({ ...newEmergency, description: text })}
                multiline
                numberOfLines={4}
                maxLength={300}
              />
            </View>

            <View style={styles.costInfo}>
              <Text style={styles.costLabel}>Costo:</Text>
              <Text style={styles.costValue}>{CURRENCY_SYMBOL} 1 {CURRENCY_NAME.slice(0, -1)}e</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleCreateEmergency}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="alert-circle" size={18} color="#fff" />
                    <Text style={styles.modalConfirmText}>Invia Emergenza</Text>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
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
    padding: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 20,
  },
  emergencyCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b6b',
  },
  emergencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  urgentText: {
    color: '#ff6b6b',
    fontSize: 11,
    fontWeight: 'bold',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: '600',
  },
  emergencyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emergencyDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 12,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorAvatarText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  creatorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  creatorTitle: {
    color: '#888',
    fontSize: 12,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
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
    height: 100,
    textAlignVertical: 'top',
  },
  costInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  costLabel: {
    color: '#888',
    fontSize: 14,
  },
  costValue: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: '#ff6b6b',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});
