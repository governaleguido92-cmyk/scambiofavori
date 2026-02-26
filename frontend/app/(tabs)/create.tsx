import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Category, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';

const DEBT_LIMIT = -3; // Social debt threshold

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'car',
  'Spesa': 'cart',
  'Tecnologia': 'laptop',
  'Pulizie': 'water',
  'Compagnia': 'people',
  'Cucina': 'restaurant',
  'Giardinaggio': 'leaf',
  'Consiglio': 'bulb',
  'Informazione': 'information-circle',
  'Aiuto Rapido': 'flash',
  'Altro': 'ellipsis-horizontal',
};

export default function CreateFavorScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const [type, setType] = useState<'offer' | 'request'>('offer');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [durationHours, setDurationHours] = useState('1');
  const [validityDays, setValidityDays] = useState(3); // Durata annuncio (1-10 giorni)
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [publishToWall, setPublishToWall] = useState(false);

  // Check if user is in social debt
  const isInDebt = (user?.granelli || 0) <= DEBT_LIMIT;

  // Opzioni durata annuncio
  const validityOptions = [1, 2, 3, 5, 7, 10];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
      if (data.length > 0) setCategory(data[0].name);
    } catch (error) {
      console.log('Error loading categories:', error);
    }
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso negato', 'Abilita la localizzazione per aggiungere la posizione');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addr) {
          setAddress(`${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || ''}`.trim());
        }
      } catch {
        setAddress('Posizione attuale');
      }
    } catch (error) {
      Alert.alert('Errore', 'Impossibile ottenere la posizione');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleCreate = async () => {
    // Check social debt before allowing request
    if (type === 'request' && isInDebt) {
      setShowDebtModal(true);
      return;
    }

    if (!title.trim()) {
      Alert.alert('Errore', 'Inserisci un titolo');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Errore', 'Inserisci una descrizione');
      return;
    }
    if (!category) {
      Alert.alert('Errore', 'Seleziona una categoria');
      return;
    }
    if (!location) {
      Alert.alert('Posizione Obbligatoria', 'Devi indicare la tua posizione per pubblicare un favore. Questo aiuta gli altri utenti a trovarti!');
      return;
    }

    const duration = parseFloat(durationHours) || 1;
    const granelliNeeded = Math.max(1, Math.round(duration));

    if (type === 'request' && (user?.granelli || 0) < granelliNeeded) {
      Alert.alert(`${CURRENCY_NAME} insufficienti`, `Hai solo ${user?.granelli} ${CURRENCY_NAME} disponibili. Servono ${granelliNeeded} ${CURRENCY_NAME}.`);
      return;
    }

    if (!token) return;

    setIsLoading(true);
    try {
      if (publishToWall) {
        // Pubblica solo sul Muro del Quartiere (non come annuncio)
        await api.createWallPost(
          {
            title: title.trim(),
            description: description.trim(),
            category,
            latitude: location?.latitude,
            longitude: location?.longitude,
          },
          token
        );
        
        await refreshUser();
        
        Alert.alert(
          'Pubblicato sul Muro!',
          'Il tuo post è stato condiviso sul muro del quartiere.',
          [
            {
              text: 'OK',
              onPress: () => {
                setTitle('');
                setDescription('');
                setDurationHours('1');
                setValidityDays(3);
                setAddress('');
                setLocation(null);
                setPublishToWall(false);
                router.push('/(tabs)');
              },
            },
          ]
        );
      } else {
        // Pubblica come annuncio normale
        await api.createFavor(
          {
            type,
            title: title.trim(),
            description: description.trim(),
            category,
            duration_hours: duration,
            validity_days: validityDays,
            latitude: location?.latitude,
            longitude: location?.longitude,
            address: address || undefined,
          },
          token
        );

        await refreshUser();
        
        Alert.alert(
          'Successo',
          type === 'offer' 
            ? 'La tua offerta è stata pubblicata!' 
            : 'La tua richiesta è stata pubblicata!',
          [
            {
              text: 'OK',
              onPress: () => {
                setTitle('');
                setDescription('');
                setDurationHours('1');
                setValidityDays(3);
                setAddress('');
                setLocation(null);
                router.push('/(tabs)');
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile creare il post');
    } finally {
      setIsLoading(false);
    }
  };

  const granelliPreview = Math.max(1, Math.round(parseFloat(durationHours) || 1));

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Crea Favore</Text>
            <View style={styles.soliDisplay}>
              <Text style={styles.soliSymbol}>{CURRENCY_SYMBOL}</Text>
              <Text style={[styles.soliValue, isInDebt && styles.soliValueDebt]}>{user?.granelli || 0}</Text>
            </View>
          </View>

          {/* Debt Warning Banner */}
          {isInDebt && (
            <TouchableOpacity 
              style={styles.debtBanner}
              onPress={() => setShowDebtModal(true)}
              data-testid="debt-warning-banner"
            >
              <Ionicons name="warning" size={20} color="#ff6b6b" />
              <View style={styles.debtBannerText}>
                <Text style={styles.debtBannerTitle}>Sei in Debito Sociale</Text>
                <Text style={styles.debtBannerSubtitle}>
                  Non puoi fare nuove richieste. Tocca per saperne di più.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ff6b6b" />
            </TouchableOpacity>
          )}

          {/* Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeButton, type === 'offer' && styles.typeButtonActive]}
              onPress={() => setType('offer')}
            >
              <Ionicons
                name="gift"
                size={24}
                color={type === 'offer' ? '#1a1a2e' : '#4ecca3'}
              />
              <Text style={[styles.typeButtonText, type === 'offer' && styles.typeButtonTextActive]}>
                Dona
              </Text>
              <Text style={[styles.typeButtonSubtext, type === 'offer' && styles.typeButtonSubtextActive]}>
                Guadagna {CURRENCY_NAME}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeButton, type === 'request' && styles.typeButtonActiveRequest]}
              onPress={() => setType('request')}
            >
              <Ionicons
                name="hand-left"
                size={24}
                color={type === 'request' ? '#1a1a2e' : '#ff6b6b'}
              />
              <Text style={[styles.typeButtonText, type === 'request' && styles.typeButtonTextActive]}>
                Ricevi
              </Text>
              <Text style={[styles.typeButtonSubtext, type === 'request' && styles.typeButtonSubtextActive]}>
                Spendi {CURRENCY_NAME}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Wall Publishing Toggle */}
          <View style={styles.wallToggle}>
            <View style={styles.wallToggleLeft}>
              <Ionicons name="megaphone" size={20} color="#4ecca3" />
              <View>
                <Text style={styles.wallToggleLabel}>Pubblica sul Muro</Text>
                <Text style={styles.wallToggleHint}>Condividi sul muro del quartiere</Text>
              </View>
            </View>
            <Switch
              value={publishToWall}
              onValueChange={setPublishToWall}
              trackColor={{ false: '#333', true: '#4ecca3' }}
              thumbColor={publishToWall ? '#fff' : '#888'}
            />
          </View>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Titolo</Text>
            <TextInput
              style={styles.input}
              placeholder="Es: Aiuto con la spesa"
              placeholderTextColor="#666"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Descrivi il favore in dettaglio..."
              placeholderTextColor="#666"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
          </View>

          {/* Category Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoria</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesScroll}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.categoryChip,
                    category === cat.name && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat.name)}
                >
                  <Ionicons
                    name={(CATEGORY_ICONS[cat.name] || 'ellipsis-horizontal') as any}
                    size={18}
                    color={category === cat.name ? '#1a1a2e' : '#4ecca3'}
                  />
                  <Text style={[
                    styles.categoryChipText,
                    category === cat.name && styles.categoryChipTextActive,
                  ]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Duration Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Durata Stimata</Text>
            <View style={styles.durationContainer}>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setDurationHours(String(Math.max(0.5, parseFloat(durationHours) - 0.5)))}
              >
                <Ionicons name="remove" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.durationDisplay}>
                <TextInput
                  style={styles.durationValue}
                  value={durationHours}
                  onChangeText={setDurationHours}
                  keyboardType="decimal-pad"
                  maxLength={4}
                />
                <Text style={styles.durationUnit}>ore</Text>
              </View>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setDurationHours(String(parseFloat(durationHours) + 0.5))}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.parityInfo}>
              <Ionicons name="information-circle" size={16} color="#4ecca3" />
              <Text style={styles.parityText}>1 ora = 1 {CURRENCY_NAME} (Parità di Valore)</Text>
            </View>
          </View>

          {/* Granelli Preview */}
          <View style={styles.granelliPreview}>
            <Text style={styles.granelliPreviewLabel}>
              {type === 'offer' ? 'Guadagnerai:' : 'Spenderai:'}
            </Text>
            <View style={styles.granelliPreviewValue}>
              <Text style={styles.granelliPreviewSymbol}>{CURRENCY_SYMBOL}</Text>
              <Text style={styles.granelliPreviewNumber}>{granelliPreview}</Text>
              <Text style={styles.granelliPreviewUnit}>{CURRENCY_NAME}</Text>
            </View>
          </View>

          {/* Validity Days Selector */}
          <View style={styles.inputGroup}>
            <View style={styles.validityHeader}>
              <Text style={styles.label}>Durata Annuncio</Text>
              <View style={styles.validityBadge}>
                <Ionicons name="time-outline" size={14} color="#4ecca3" />
                <Text style={styles.validityBadgeText}>{validityDays} {validityDays === 1 ? 'giorno' : 'giorni'}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.validityScroll}
            >
              {validityOptions.map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.validityChip,
                    validityDays === days && styles.validityChipActive,
                  ]}
                  onPress={() => setValidityDays(days)}
                  data-testid={`validity-${days}`}
                >
                  <Text style={[
                    styles.validityChipText,
                    validityDays === days && styles.validityChipTextActive,
                  ]}>
                    {days} {days === 1 ? 'g' : 'gg'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.validityHint}>
              L'annuncio scadrà automaticamente dopo {validityDays} {validityDays === 1 ? 'giorno' : 'giorni'}
            </Text>
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Posizione (opzionale)</Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={getLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#4ecca3" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#4ecca3" />
                  <Text style={styles.locationButtonText}>
                    {location ? 'Cambia posizione' : 'Aggiungi posizione'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {address && (
              <View style={styles.addressContainer}>
                <Ionicons name="checkmark-circle" size={16} color="#4ecca3" />
                <Text style={styles.addressText}>{address}</Text>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton, 
              type === 'request' && styles.submitButtonRequest,
              type === 'request' && isInDebt && styles.submitButtonDisabled
            ]}
            onPress={handleCreate}
            disabled={isLoading || (type === 'request' && isInDebt)}
            data-testid="create-favor-submit"
          >
            {isLoading ? (
              <ActivityIndicator color="#1a1a2e" />
            ) : (
              <>
                <Ionicons
                  name={type === 'offer' ? 'gift' : 'hand-left'}
                  size={20}
                  color={type === 'request' && isInDebt ? '#666' : '#1a1a2e'}
                />
                <Text style={[
                  styles.submitButtonText,
                  type === 'request' && isInDebt && styles.submitButtonTextDisabled
                ]}>
                  {type === 'offer' ? 'Pubblica Offerta' : 'Pubblica Richiesta'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Ethical Banner */}
          <View style={styles.ethicalBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#2D5A3D" />
            <Text style={styles.ethicalBannerText}>
              Pubblicando, confermi che il favore rispetta i nostri standard etici e di sicurezza
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Social Debt Modal */}
      <Modal
        visible={showDebtModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDebtModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="warning" size={40} color="#ff6b6b" />
              </View>
              <Text style={styles.modalTitle}>Debito Sociale</Text>
            </View>
            
            <Text style={styles.modalText}>
              Il tuo saldo di {CURRENCY_NAME} è sceso a {user?.granelli || 0} {CURRENCY_SYMBOL}, 
              superando il limite di debito consentito ({DEBT_LIMIT}).
            </Text>

            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoTitle}>Come tornare in positivo:</Text>
              <View style={styles.modalInfoItem}>
                <Ionicons name="gift-outline" size={18} color="#4ecca3" />
                <Text style={styles.modalInfoText}>Offri favori alla community</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="heart-outline" size={18} color="#4ecca3" />
                <Text style={styles.modalInfoText}>Richiedi aiuto dal Fondo Solidarietà</Text>
              </View>
            </View>

            <Text style={styles.modalWarning}>
              Le tue offerte sono evidenziate nel feed per aiutarti a guadagnare {CURRENCY_NAME} più rapidamente.
            </Text>

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setShowDebtModal(false)}
              data-testid="close-debt-modal"
            >
              <Text style={styles.modalButtonText}>Ho capito</Text>
            </TouchableOpacity>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  soliDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  soliSymbol: {
    fontSize: 18,
  },
  soliValue: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    backgroundColor: '#4ecca3',
    borderColor: '#4ecca3',
  },
  typeButtonActiveRequest: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  typeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  typeButtonTextActive: {
    color: '#1a1a2e',
  },
  typeButtonSubtext: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  typeButtonSubtextActive: {
    color: '#1a1a2e',
    opacity: 0.8,
  },
  microToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  microToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  microToggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  microToggleHint: {
    color: '#888',
    fontSize: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 120,
    paddingTop: 16,
  },
  categoriesScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    gap: 8,
  },
  categoryChipActive: {
    backgroundColor: '#4ecca3',
  },
  categoryChipMicro: {
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 14,
  },
  categoryChipTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  durationButton: {
    backgroundColor: '#16213e',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationDisplay: {
    alignItems: 'center',
  },
  durationValue: {
    backgroundColor: '#16213e',
    color: '#4ecca3',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 100,
    paddingVertical: 8,
    borderRadius: 12,
  },
  durationUnit: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  parityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  parityText: {
    color: '#4ecca3',
    fontSize: 12,
  },
  soliPreview: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  soliPreviewLabel: {
    color: '#888',
    fontSize: 14,
  },
  soliPreviewValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  granelliPreviewSymbol: {
    fontSize: 24,
  },
  granelliPreviewNumber: {
    color: '#ffd700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  granelliPreviewUnit: {
    color: '#888',
    fontSize: 14,
  },
  // Alias for old styles
  soliPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  soliPreviewLabel: {
    color: '#888',
    fontSize: 14,
  },
  soliPreviewValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  soliPreviewSymbol: {
    fontSize: 24,
  },
  soliPreviewNumber: {
    color: '#ffd700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  soliPreviewUnit: {
    color: '#888',
    fontSize: 14,
  },
  wallToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  wallToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wallToggleLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  wallToggleHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  locationButtonText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: '600',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  addressText: {
    color: '#888',
    fontSize: 14,
    flex: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ecca3',
    padding: 18,
    borderRadius: 16,
    gap: 10,
    marginTop: 8,
  },
  submitButtonRequest: {
    backgroundColor: '#ff6b6b',
  },
  submitButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  submitButtonTextDisabled: {
    color: '#666',
  },
  // Debt styles
  soliValueDebt: {
    color: '#ff6b6b',
  },
  debtBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    gap: 12,
  },
  debtBannerText: {
    flex: 1,
  },
  debtBannerTitle: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  debtBannerSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInfoBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  modalInfoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  modalInfoText: {
    color: '#aaa',
    fontSize: 13,
  },
  modalWarning: {
    color: '#4ecca3',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '600',
  },
  // Validity days styles
  validityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  validityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  validityBadgeText: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: '600',
  },
  validityScroll: {
    marginBottom: 8,
  },
  validityChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#16213e',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2a3a5e',
  },
  validityChipActive: {
    backgroundColor: '#4ecca3',
    borderColor: '#4ecca3',
  },
  validityChipText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  validityChipTextActive: {
    color: '#1a1a2e',
  },
  validityHint: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
  },
  ethicalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45, 90, 61, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(45, 90, 61, 0.2)',
  },
  ethicalBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#2D5A3D',
    lineHeight: 16,
  },
});
