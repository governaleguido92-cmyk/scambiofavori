import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';
import { api, Category, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import { styles } from '../../src/styles/create.styles';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';

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
  const { isOffline } = useNetworkStatus();
  const { t } = useTranslation();
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

  // Check if user has zero granelli (can only offer, not request)
  const hasZeroGranelli = (user?.granelli || 0) === 0;
  
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
      logger.debug('Error loading categories:', error);
    }
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        notify(tt('Permesso negato'), tt('Abilita la localizzazione per aggiungere la posizione'));
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
      notify(tt('Errore'), tt('Impossibile ottenere la posizione'));
    } finally {
      setGettingLocation(false);
    }
  };

  const handleCreate = async () => {
    if (isOffline) {
      notify(t('common.offline'), t('create.offlineError'));
      return;
    }
    // Check zero granelli - can only offer, not request
    if (type === 'request' && hasZeroGranelli) {
      Alert.alert(
        tt('Granelli Insufficienti'),
        tt('Hai 0 Granelli! Non puoi chiedere favori. Inizia offrendo aiuto agli altri per guadagnare Granelli.'),
        [{ text: tt('Ho capito') }]
      );
      return;
    }
    
    // Check social debt before allowing request
    if (type === 'request' && isInDebt) {
      setShowDebtModal(true);
      return;
    }

    if (!title.trim()) {
      notify(t('common.error'), t('create.errorTitle'));
      return;
    }
    if (!description.trim()) {
      notify(t('common.error'), t('create.errorDescription'));
      return;
    }
    if (!category) {
      notify(t('common.error'), t('create.errorCategory'));
      return;
    }
    if (!location) {
      notify(t('common.error'), t('create.errorLocation'));
      return;
    }

    const duration = parseFloat(durationHours) || 1;
    const granelliNeeded = Math.max(1, Math.round(duration));

    if (type === 'request' && (user?.granelli || 0) < granelliNeeded) {
      notify(tx('{0} insufficienti', [CURRENCY_NAME]), tx('Hai solo {0} {1} disponibili. Servono {2} {3}.', [user?.granelli ?? 0, CURRENCY_NAME, granelliNeeded, CURRENCY_NAME]));
      return;
    }

    if (!token) return;

    setIsLoading(true);
    try {
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
        tt('Successo'),
        type === 'offer' 
          ? tt('La tua offerta è stata pubblicata!') 
          : tt('La tua richiesta è stata pubblicata!'),
        [
          {
            text: tt('OK'),
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
    } catch (error: any) {
      notify(t('common.error'), error.message || t('create.errorTitle'));
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
            <Text style={styles.title}>{t('create.title')}</Text>
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
                <Text style={styles.debtBannerTitle}>{tt('Sei in Debito Sociale')}</Text>
                <Text style={styles.debtBannerSubtitle}>{tt('Non puoi fare nuove richieste. Tocca per saperne di più.')}</Text>
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
                color={type === 'offer' ? '#0F1A14' : '#B8C868'}
              />
              <Text style={[styles.typeButtonText, type === 'offer' && styles.typeButtonTextActive]}>{tt('Dona un favore')}</Text>
              <Text style={[styles.typeButtonSubtext, type === 'offer' && styles.typeButtonSubtextActive]}>{tt('Guadagna')}{' '}{CURRENCY_NAME}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeButton, type === 'request' && styles.typeButtonActiveRequest]}
              onPress={() => setType('request')}
            >
              <Ionicons
                name="hand-left"
                size={24}
                color={type === 'request' ? '#0F1A14' : '#ff6b6b'}
              />
              <Text style={[styles.typeButtonText, type === 'request' && styles.typeButtonTextActive]}>{tt('Ricevi un favore')}</Text>
              <Text style={[styles.typeButtonSubtext, type === 'request' && styles.typeButtonSubtextActive]}>{tt('Spendi')}{' '}{CURRENCY_NAME}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('create.titleLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={tt('Es: Aiuto con la spesa')}
              placeholderTextColor="#8FA595"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('create.descriptionLabel')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={tt('Descrivi il favore in dettaglio...')}
              placeholderTextColor="#8FA595"
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
            <Text style={styles.label}>{t('create.categoryLabel')}</Text>
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
                    size={20}
                    color={category === cat.name ? '#0F1A14' : '#B8C868'}
                  />
                  <Text style={[
                    styles.categoryChipText,
                    category === cat.name && styles.categoryChipTextActive,
                  ]}>
                    {tt(cat.name)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Duration Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{tt('Durata Stimata')}</Text>
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
                <Text style={styles.durationUnit}>{tt('ore')}</Text>
              </View>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setDurationHours(String(parseFloat(durationHours) + 0.5))}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.parityInfo}>
              <Ionicons name="information-circle" size={16} color="#B8C868" />
              <Text style={styles.parityText}>{tt('1 ora = 1')}{' '}{CURRENCY_NAME}{' '}{tt('(Parità di Valore)')}</Text>
            </View>
          </View>

          {/* Granelli Preview */}
          <View style={styles.granelliPreview}>
            <Text style={styles.granelliPreviewLabel}>
              {type === 'offer' ? tt('Guadagnerai:') : tt('Spenderai:')}
            </Text>
            <View style={styles.granelliPreviewValue}>
              <Text style={styles.granelliPreviewSymbol}>{CURRENCY_SYMBOL}</Text>
              <Text style={styles.granelliPreviewNumber}>{granelliPreview}</Text>
              <Text style={styles.granelliPreviewUnit}>{CURRENCY_NAME}</Text>
            </View>
          </View>
          {type === 'request' && (
            <Text style={styles.fieldHint}>{tt('Questi')}{' '}{CURRENCY_NAME}{' '}{tt('li paghi a chi ti aiuta, a favore completato. Ora ne hai')}{' '}{user?.granelli || 0}.
            </Text>
          )}

          {/* Validity Days Selector */}
          <View style={styles.inputGroup}>
            <View style={styles.validityHeader}>
              <Text style={styles.label}>{tt('Durata Annuncio')}</Text>
              <View style={styles.validityBadge}>
                <Ionicons name="time-outline" size={14} color="#B8C868" />
                <Text style={styles.validityBadgeText}>{validityDays} {validityDays === 1 ? tt('giorno') : tt('giorni')}</Text>
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
                    {days} {days === 1 ? tt('g') : tt('gg')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.validityHint}>{tt('L\'annuncio scadrà automaticamente dopo')}{' '}{validityDays} {validityDays === 1 ? tt('giorno') : tt('giorni')}
            </Text>
          </View>

          {/* Location - Hidden from UI, automatically added */}
          <View style={styles.inputGroup}>
            <View style={styles.locationInfoBox}>
              <Ionicons name="shield-checkmark" size={20} color="#B8C868" />
              <View style={styles.locationInfoText}>
                <Text style={styles.locationInfoTitle}>{tt('Privacy Protetta')}</Text>
                <Text style={styles.locationInfoDescription}>{tt('La tua posizione sarà visibile solo sulla mappa. Potrai condividere l\'indirizzo esatto via chat.')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={getLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#B8C868" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#B8C868" />
                  <Text style={styles.locationButtonText}>
                    {location ? tt('Posizione aggiunta') : tt('Aggiungi posizione (obbligatoria)')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {location && (
              <View style={styles.addressContainer}>
                <Ionicons name="checkmark-circle" size={16} color="#B8C868" />
                <Text style={styles.addressText}>{tt('Posizione salvata (visibile solo sulla mappa)')}</Text>
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
              <ActivityIndicator color="#0F1A14" />
            ) : (
              <>
                <Ionicons
                  name={type === 'offer' ? 'gift' : 'hand-left'}
                  size={20}
                  color={type === 'request' && isInDebt ? '#8FA595' : '#0F1A14'}
                />
                <Text style={[
                  styles.submitButtonText,
                  type === 'request' && isInDebt && styles.submitButtonTextDisabled
                ]}>
                  {t('create.publishBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Ethical Banner */}
          <View style={styles.ethicalBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#2D5A3D" />
            <Text style={styles.ethicalBannerText}>{tt('Pubblicando, confermi che il favore rispetta i nostri standard etici e di sicurezza')}</Text>
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
              <Text style={styles.modalTitle}>{tt('Debito Sociale')}</Text>
            </View>
            
            <Text style={styles.modalText}>{tt('Il tuo saldo di')}{' '}{CURRENCY_NAME}{' '}{tt('è sceso a')}{' '}{user?.granelli || 0} {CURRENCY_SYMBOL}{tt(', superando il limite di debito consentito (')}{DEBT_LIMIT}).
            </Text>

            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoTitle}>{tt('Come tornare in positivo:')}</Text>
              <View style={styles.modalInfoItem}>
                <Ionicons name="gift-outline" size={20} color="#B8C868" />
                <Text style={styles.modalInfoText}>{tt('Offri favori alla community')}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="heart-outline" size={20} color="#B8C868" />
                <Text style={styles.modalInfoText}>{tt('Richiedi aiuto dal Fondo Solidarietà')}</Text>
              </View>
            </View>

            <Text style={styles.modalWarning}>{tt('Le tue offerte sono evidenziate nel feed per aiutarti a guadagnare')}{' '}{CURRENCY_NAME}{' '}{tt('più rapidamente.')}</Text>

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setShowDebtModal(false)}
              data-testid="close-debt-modal"
            >
              <Text style={styles.modalButtonText}>{tt('Ho capito')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
