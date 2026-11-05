import { avatarColorsForKind } from '../../src/utils/avatarColor';
import { GranelloIcon } from '../../src/components/GranelloIcon';
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
import { openPhoneVerificationIfNeeded } from '../../src/utils/phoneRequired';
import { BrandLogo } from '../../src/components/BrandLogo';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, CURRENCY_NAME } from '../../src/services/api';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt } from '../../src/i18n/tt';
import { goBackOrHome } from '../../src/utils/navigation';

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
      logger.debug('Error getting location:', error);
    }
  };

  const loadEmergencies = useCallback(async () => {
    if (!token || !location) return;
    try {
      const data = await api.getEmergencies(location.latitude, location.longitude, token);
      setEmergencies(data);
    } catch (error) {
      logger.debug('Error loading emergencies:', error);
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
      tt('Aiuta questa persona'),
      tt('Sei sicuro di voler rispondere a questa emergenza di gentilezza?'),
      [
        { text: tt('Annulla'), style: 'cancel' },
        {
          text: tt('Sì, aiuto!'),
          onPress: async () => {
            try {
              await api.acceptFavor(favorId, token);
              loadEmergencies();
              notify(tt('Grazie!'), tt('Hai risposto all\'emergenza. Contatta la persona per aiutarla.'));
              router.push(`/favor/${favorId}` as any);
            } catch (error: any) {
              if (!openPhoneVerificationIfNeeded(error, router)) notify(tt('Errore'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleCreateEmergency = async () => {
    if (!token || !location) return;
    if (!newEmergency.title.trim()) {
      notify(tt('Errore'), tt('Inserisci un titolo'));
      return;
    }
    if (!newEmergency.description.trim()) {
      notify(tt('Errore'), tt('Descrivi la tua emergenza'));
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
        tt('Emergenza Inviata!'),
        tt('Le persone vicine a te saranno notificate. Qualcuno ti aiuterà presto!'),
        [
          { text: tt('OK'), onPress: () => router.push(`/favor/${favor.favor_id}` as any) }
        ]
      );
    } catch (error: any) {
      if (!openPhoneVerificationIfNeeded(error, router)) notify(tt('Errore'), error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderEmergencyCard = ({ item }: { item: Favor }) => (
    <View style={styles.emergencyCard}>
      <View style={styles.emergencyHeader}>
        <View style={styles.urgentBadge}>
          <Ionicons name="alert-circle" size={16} color="#F87828" />
          <Text style={styles.urgentText}>{tt('URGENTE')}</Text>
        </View>
        {item.distance_km !== undefined && (
          <View style={styles.distanceBadge}>
            <Ionicons name="location" size={14} color="#98AA4A" />
            <Text style={styles.distanceText}>{item.distance_km}{' '}{tt('km')}</Text>
          </View>
        )}
      </View>

      <Text style={styles.emergencyTitle}>{item.title}</Text>
      <Text style={styles.emergencyDescription}>{item.description}</Text>

      <View style={styles.creatorInfo}>
        <View style={[styles.creatorAvatar, { backgroundColor: avatarColorsForKind(true).backgroundColor }]}>
          <Text style={[styles.creatorAvatarText, { color: avatarColorsForKind(true).color }]}>
            {item.creator_name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <View>
          <Text style={styles.creatorName}>{item.creator_name}</Text>
          <Text style={styles.creatorTitle}>{tt(item.creator_title)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.helpButton}
        onPress={() => handleAcceptEmergency(item.favor_id)}
      >
        <Ionicons name="heart" size={20} color="#fff" />
        <Text style={styles.helpButtonText}>{tt('Voglio Aiutare')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 10 }}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goBackOrHome(router)}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <BrandLogo />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{tt('Emergenze Gentilezza')}</Text>
          <Text style={styles.subtitle}>{tt('Aiuta chi ha bisogno vicino a te')}</Text>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#98AA4A" />
        <Text style={styles.infoBannerText}>{tt('Le emergenze sono richieste urgenti inviate a vicini affidabili e valutati positivamente.')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F87828" />
        </View>
      ) : emergencies.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={64} color="#98AA4A" />
          </View>
          <Text style={styles.emptyText}>{tt('Nessuna emergenza nelle vicinanze')}</Text>
          <Text style={styles.emptySubtext}>{tt('Il quartiere è tranquillo! Ma se hai bisogno, puoi sempre chiedere aiuto.')}</Text>
        </View>
      ) : (
        <FlatList
          data={emergencies}
          renderItem={renderEmergencyCard}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F87828" />
          }
        />
      )}

      {/* Create Emergency Button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={24} color="#0C0E09" />
        <Text style={styles.createButtonText}>{tt('Ho bisogno di aiuto')}</Text>
      </TouchableOpacity>

      {/* Create Emergency Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={32} color="#F87828" />
              <Text style={styles.modalTitle}>{tt('Emergenza Gentilezza')}</Text>
            </View>
            <Text style={styles.modalSubtitle}>{tt('Le persone affidabili vicino a te riceveranno una notifica')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tt('Di cosa hai bisogno?')}</Text>
              <TextInput
                style={styles.input}
                placeholder={tt('Es: Aiuto urgente con...')}
                placeholderTextColor="#A5A89B"
                value={newEmergency.title}
                onChangeText={(text) => setNewEmergency({ ...newEmergency, title: text })}
                maxLength={60}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tt('Descrivi la situazione')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={tt('Spiega brevemente cosa ti serve...')}
                placeholderTextColor="#A5A89B"
                value={newEmergency.description}
                onChangeText={(text) => setNewEmergency({ ...newEmergency, description: text })}
                multiline
                numberOfLines={4}
                maxLength={300}
              />
            </View>

            <View style={styles.costInfo}>
              <Text style={styles.costLabel}>{tt('Costo:')}</Text>
              <Text style={styles.costValue}><GranelloIcon size={14} /> 1 {CURRENCY_NAME.slice(0, -1)}e</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalCancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleCreateEmergency}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#0C0E09" />
                ) : (
                  <>
                    <Ionicons name="alert-circle" size={20} color="#0C0E09" />
                    <Text style={styles.modalConfirmText}>{tt('Invia Emergenza')}</Text>
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
    backgroundColor: '#0C0E09',
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
    backgroundColor: '#171A10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#A5A89B',
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171A10',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    color: '#A5A89B',
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
    backgroundColor: '#171A10',
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
    color: '#A5A89B',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 20,
  },
  emergencyCard: {
    backgroundColor: '#171A10',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F87828',
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
    backgroundColor: 'rgba(248, 120, 40, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  urgentText: {
    color: '#F87828',
    fontSize: 12,
    fontWeight: 'bold',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: '#98AA4A',
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
    color: '#A5A89B',
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
    backgroundColor: '#0C0E09',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorAvatarText: {
    color: '#98AA4A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  creatorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  creatorTitle: {
    color: '#A5A89B',
    fontSize: 12,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F87828',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  helpButtonText: {
    color: '#0C0E09',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F87828',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  createButtonText: {
    color: '#0C0E09',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#171A10',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalSubtitle: {
    color: '#A5A89B',
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
    backgroundColor: '#0C0E09',
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
    backgroundColor: '#0C0E09',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  costLabel: {
    color: '#A5A89B',
    fontSize: 14,
  },
  costValue: {
    color: '#98AA4A',
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
    borderColor: '#A5A89B',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#A5A89B',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F87828',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});
