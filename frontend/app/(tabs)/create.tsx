import { GranelloIcon } from '../../src/components/GranelloIcon';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { openPhoneVerificationIfNeeded } from '../../src/utils/phoneRequired';
import { BrandLogo } from '../../src/components/BrandLogo';
import { DescriptionPrompts, DurationSuggestion, PrePublishCheck, SafetyTips } from '../../src/components/create/FavorHelp';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';
import { api, Category, Favor, CURRENCY_NAME } from '../../src/services/api';
import { styles } from '../../src/styles/create.styles';
import { FavorCard } from '../../src/components/FavorCard';
import { getCategoryVisual } from '../../src/utils/favorVisual';
import { getTitleExamples } from '../../src/utils/favorExamples';
import { granelliWord } from '../../src/utils/granelli';
import { logger } from '../../src/utils/logger';
import { notify, showRefusal } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';

const DEBT_LIMIT = -3; // Social debt threshold

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_HOURS = 1; // si va di ora in ora, niente mezze ore

// Durata dell'annuncio: tre scelte semplici (il server accetta da 1 a 10 giorni).
/** Un favore vecchio può avere una durata che non è tra le tre scelte: si porta alla più vicina. */
const nearestValidity = (days: number): number => (days <= 1 ? 1 : days <= 4 ? 3 : 7);

const PREFILL_KEYS = ['editId', 'title', 'description', 'category', 'type', 'durationHours', 'validityDays'] as const;

const VALIDITY_CHOICES: ReadonlyArray<{ days: number; label: string }> = [
  { days: 1, label: '1 giorno' },
  { days: 3, label: '3 giorni' },
  { days: 7, label: '1 settimana' },
];

export default function CreateFavorScreen() {
  const { user, token, refreshUser } = useAuth();
  const { isOffline } = useNetworkStatus();
  const { t } = useTranslation();
  const router = useRouter();
  // "Ripubblica" e "Modifica" da I Miei aprono questa pagina con i dati già compilati.
  // Con editId il favore esistente viene aggiornato; senza, se ne pubblica uno nuovo.
  const prefill = useLocalSearchParams<{
    editId?: string; title?: string; description?: string; category?: string; type?: string; durationHours?: string; validityDays?: string;
  }>();
  const editingId = prefill.editId ? String(prefill.editId) : null;
  const editing = editingId !== null;
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
  // Un debito sociale impedisce di pubblicare nuove richieste, non di correggere una già pubblicata
  const blocked = !editing && type === 'request' && isInDebt;

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (prefill.title) setTitle(String(prefill.title).slice(0, TITLE_MAX));
    if (prefill.description) setDescription(String(prefill.description).slice(0, DESCRIPTION_MAX));
    if (prefill.type === 'offer' || prefill.type === 'request') setType(prefill.type);
    if (prefill.durationHours && /^\d{1,3}$/.test(String(prefill.durationHours))) setDurationHours(String(prefill.durationHours));
    if (prefill.validityDays && Number.isFinite(Number(prefill.validityDays))) setValidityDays(nearestValidity(Number(prefill.validityDays)));
  }, [prefill.title, prefill.description, prefill.type, prefill.durationHours, prefill.validityDays]);

  // Uscendo dalla pagina i dati precompilati vanno via: tornando su "Crea" si riparte da un favore nuovo.
  const hasPrefillRef = useRef(false);
  hasPrefillRef.current = PREFILL_KEYS.some((key) => Boolean(prefill[key]));
  const clearPrefill = useCallback(() => {
    setTitle('');
    setDescription('');
    setDurationHours('1');
    setValidityDays(3);
    router.setParams(Object.fromEntries(PREFILL_KEYS.map((key) => [key, undefined])) as any);
  }, [router]);
  useFocusEffect(
    useCallback(() => () => {
      if (hasPrefillRef.current) clearPrefill();
    }, [clearPrefill])
  );

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
      const wanted = data.find((cat) => cat.name === prefill.category);
      if (wanted) setCategory(wanted.name);
      else if (data.length > 0) setCategory(data[0].name);
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

      let loc: Location.LocationObject | null = null;
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        // Se il GPS non risponde, usa l'ultima posizione nota del dispositivo
        loc = await Location.getLastKnownPositionAsync();
      }
      if (!loc) {
        notify(
          tt('Posizione non disponibile'),
          tt('Il dispositivo non riesce a darci la posizione. Controlla che la localizzazione e il Wi-Fi o il GPS siano attivi e riprova.')
        );
        return;
      }
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

  /** Titolo, descrizione e categoria obbligatori: mostra l'errore e dice se si può andare avanti. */
  const validateTexts = (): boolean => {
    if (!title.trim()) {
      notify(t('common.error'), t('create.errorTitle'));
      return false;
    }
    if (!description.trim()) {
      notify(t('common.error'), t('create.errorDescription'));
      return false;
    }
    if (!category) {
      notify(t('common.error'), t('create.errorCategory'));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!editingId || !token) return;
    if (isOffline) {
      notify(t('common.offline'), t('create.offlineError'));
      return;
    }
    if (!validateTexts()) return;
    if (type === 'request' && (user?.granelli || 0) < currentHours) {
      notify(tx('{0} insufficienti', [CURRENCY_NAME]), tx('Hai solo {0} {1} disponibili. Servono {2} {3}.', [user?.granelli ?? 0, CURRENCY_NAME, currentHours, CURRENCY_NAME]));
      return;
    }
    setIsLoading(true);
    try {
      await api.updateFavor(
        editingId,
        { title: title.trim(), description: description.trim(), category, duration_hours: currentHours, validity_days: validityDays },
        token
      );
      notify(t('common.success'), tt('Favore aggiornato!'));
      clearPrefill();
      router.push('/(tabs)/my-favors');
    } catch (error: any) {
      notify(t('common.error'), error.message || t('create.errorTitle'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    clearPrefill();
    router.push('/(tabs)/my-favors');
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

    if (!validateTexts()) return;
    if (!location) {
      notify(t('common.error'), t('create.errorLocation'));
      return;
    }

    const duration = currentHours;
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
      if (!openPhoneVerificationIfNeeded(error, router)) {
        showRefusal(t('common.error'), error.message || t('create.errorTitle'), tt('Ho capito'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Ore intere, almeno 1: un campo vuoto o 0 vale 1.
  const currentHours = Math.max(MIN_HOURS, parseInt(durationHours, 10) || MIN_HOURS);
  const granelliPreview = currentHours;
  const titleExamples = getTitleExamples(category);

  // Scheda di anteprima costruita dai campi del form, con segnaposto finché non si scrive.
  const previewFavor: Favor = {
    favor_id: 'preview',
    creator_id: user?.user_id ?? '',
    creator_name: user?.name || '?',
    creator_title: '',
    creator_is_supporter: false,
    type,
    title: title.trim() || tt('Il titolo del tuo favore'),
    description: description.trim() || tt('Qui comparirà la descrizione.'),
    category: category || 'Altro',
    duration_hours: currentHours,
    granelli_cost: granelliPreview,
    status: 'active',
    is_emergency: false,
    creator_in_debt: false,
    validity_days: validityDays,
    expires_at: new Date(Date.now() + validityDays * DAY_MS).toISOString(),
    checkin_completed: false,
    created_at: new Date().toISOString(),
  };

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BrandLogo />
              <Text style={styles.title}>{editing ? tt('Modifica il favore') : t('create.title')}</Text>
            </View>
            <View style={styles.soliDisplay}>
              <GranelloIcon size={18} />
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
              <Ionicons name="warning" size={20} color="#F87828" />
              <View style={styles.debtBannerText}>
                <Text style={styles.debtBannerTitle}>{tt('Sei in Debito Sociale')}</Text>
                <Text style={styles.debtBannerSubtitle}>{tt('Non puoi fare nuove richieste. Tocca per saperne di più.')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#F87828" />
            </TouchableOpacity>
          )}

          {/* Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeButton, type === 'offer' && styles.typeButtonActive, editing && type !== 'offer' && styles.typeButtonLocked]}
              onPress={() => setType('offer')}
              disabled={editing}
              accessibilityState={{ selected: type === 'offer', disabled: editing }}
            >
              <Ionicons
                name="gift"
                size={24}
                color={type === 'offer' ? '#0C0E09' : '#98AA4A'}
              />
              <Text style={[styles.typeButtonText, type === 'offer' && styles.typeButtonTextActive]}>{tt('Offro un favore')}</Text>
              <Text style={[styles.typeButtonSubtext, type === 'offer' && styles.typeButtonSubtextActive]}>{tt('Guadagni')}{' '}{CURRENCY_NAME}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeButton, type === 'request' && styles.typeButtonActiveRequest, editing && type !== 'request' && styles.typeButtonLocked]}
              onPress={() => setType('request')}
              disabled={editing}
              accessibilityState={{ selected: type === 'request', disabled: editing }}
            >
              <Ionicons
                name="hand-left"
                size={24}
                color={type === 'request' ? '#0C0E09' : '#F87828'}
              />
              <Text style={[styles.typeButtonText, type === 'request' && styles.typeButtonTextActive]}>{tt('Chiedo un favore')}</Text>
              <Text style={[styles.typeButtonSubtext, type === 'request' && styles.typeButtonSubtextActive]}>{tt('Spendi')}{' '}{CURRENCY_NAME}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Posizione: subito in alto, perché è obbligatoria e serve sapere cosa vedranno gli altri (in modifica non cambia) */}
          {!editing && (
          <View style={styles.inputGroup}>
            <View style={styles.locationInfoBox}>
              <Ionicons name="shield-checkmark" size={20} color="#98AA4A" />
              <View style={styles.locationInfoText}>
                <Text style={styles.locationInfoTitle}>{tt('Privacy Protetta')}</Text>
                <Text style={styles.locationInfoDescription}>{tt('Gli altri vedranno solo una zona approssimata sulla mappa, non il tuo indirizzo. L\'indirizzo esatto lo condividi tu in chat.')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={getLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#98AA4A" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#98AA4A" />
                  <Text style={styles.locationButtonText}>
                    {location ? tt('Posizione aggiunta') : tt('Aggiungi posizione (obbligatoria)')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {location && (
              <View style={styles.addressContainer}>
                <Ionicons name="checkmark-circle" size={16} color="#98AA4A" />
                <Text style={styles.addressText}>{tt('Posizione salvata (visibile solo sulla mappa)')}</Text>
              </View>
            )}
          </View>
          )}

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('create.titleLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={tt('Es: Aiuto con la spesa')}
              placeholderTextColor="#A5A89B"
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
            />
            <Text style={styles.charCounter}>{title.length}/{TITLE_MAX}</Text>
            {title.length === 0 && titleExamples.length > 0 && (
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>{tt('Per esempio')}:</Text>
                {titleExamples.map((example) => (
                  <TouchableOpacity
                    key={example}
                    style={styles.exampleChip}
                    onPress={() => setTitle(example)}
                    accessibilityRole="button"
                    accessibilityLabel={example}
                  >
                    <Text style={styles.exampleChipText}>{example}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('create.descriptionLabel')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={tt('Descrivi il favore in dettaglio...')}
              placeholderTextColor="#A5A89B"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={DESCRIPTION_MAX}
            />
            <Text style={styles.charCounter}>{description.length}/{DESCRIPTION_MAX}</Text>
            <DescriptionPrompts category={category} description={description} max={DESCRIPTION_MAX} onChange={setDescription} />
          </View>

          {/* Category Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('create.categoryLabel')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesScroll}
            >
              {categories.map((cat) => {
                const visual = getCategoryVisual(cat.name);
                const active = category === cat.name;
                return (
                  <TouchableOpacity
                    key={cat.name}
                    style={[styles.categoryChip, active && { backgroundColor: visual.color }]}
                    onPress={() => setCategory(cat.name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.categoryChipEmoji}>{visual.emoji}</Text>
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextOnColor]}>
                      {tt(cat.name)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Duration Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{tt('Durata Stimata')}</Text>
            <View style={styles.durationContainer}>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setDurationHours(String(Math.max(MIN_HOURS, currentHours - 1)))}
              >
                <Ionicons name="remove" size={24} color="#0C0E09" />
              </TouchableOpacity>
              <View style={styles.durationDisplay}>
                <TextInput
                  style={styles.durationValue}
                  value={durationHours}
                  onChangeText={(text) => setDurationHours(text.replace(/[^0-9]/g, ''))}
                  onBlur={() => setDurationHours(String(currentHours))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.durationUnit}>{tt('ore')}</Text>
              </View>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setDurationHours(String(currentHours + 1))}
              >
                <Ionicons name="add" size={24} color="#0C0E09" />
              </TouchableOpacity>
            </View>
            <View style={styles.parityInfo}>
              <Ionicons name="information-circle" size={16} color="#98AA4A" />
              <Text style={styles.parityText}>{tt('1 ora = 1')}{' '}{granelliWord(1)}{' '}{tt('(Parità di Valore)')}</Text>
            </View>
            <DurationSuggestion category={category} hours={currentHours} onAccept={(hours) => setDurationHours(String(hours))} />
          </View>

          {/* Granelli Preview */}
          <View style={styles.granelliPreview}>
            <Text style={styles.granelliPreviewLabel}>
              {type === 'offer' ? tt('Guadagnerai:') : tt('Spenderai:')}
            </Text>
            <View style={styles.granelliPreviewValue}>
              <GranelloIcon size={18} />
              <Text style={styles.granelliPreviewNumber}>{granelliPreview}</Text>
              <Text style={styles.granelliPreviewUnit}>{granelliWord(granelliPreview)}</Text>
            </View>
          </View>
          {type === 'request' && (
            <Text style={styles.fieldHint}>{tt('Questi')}{' '}{CURRENCY_NAME}{' '}{tt('li paghi a chi ti aiuta, a favore completato. Ora ne hai')}{' '}{user?.granelli || 0}.
            </Text>
          )}

          {/* Durata annuncio: tre scelte semplici */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{tt('Durata Annuncio')}</Text>
            <View style={styles.validityChoices}>
              {VALIDITY_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={choice.days}
                  style={[styles.validityChoice, validityDays === choice.days && styles.validityChoiceActive]}
                  onPress={() => setValidityDays(choice.days)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: validityDays === choice.days }}
                  data-testid={`validity-${choice.days}`}
                >
                  <Text style={[styles.validityChoiceText, validityDays === choice.days && styles.validityChoiceTextActive]}>
                    {tt(choice.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.validityHint}>{tt('L\'annuncio scadrà automaticamente dopo')}{' '}{validityDays} {validityDays === 1 ? tt('giorno') : tt('giorni')}
            </Text>
          </View>

          {/* Anteprima: come lo vedranno i vicini */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{tt('Così lo vedranno i vicini')}</Text>
            <View style={styles.previewWrap}>
              <FavorCard item={previewFavor} onPress={() => undefined} style={styles.previewCard} />
            </View>
          </View>

          {/* Consigli e promemoria prima di pubblicare */}
          <SafetyTips category={category} />
          <PrePublishCheck title={title} description={description} />

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              type === 'request' && styles.submitButtonRequest,
              blocked && styles.submitButtonDisabled
            ]}
            onPress={editing ? handleSave : handleCreate}
            disabled={isLoading || blocked}
            accessibilityRole="button"
            data-testid="create-favor-submit"
          >
            {isLoading ? (
              <ActivityIndicator color="#0C0E09" />
            ) : (
              <>
                <Ionicons
                  name={editing ? 'checkmark-circle' : type === 'offer' ? 'gift' : 'hand-left'}
                  size={20}
                  color={blocked ? '#A5A89B' : '#0C0E09'}
                />
                <Text style={[styles.submitButtonText, blocked && styles.submitButtonTextDisabled]}>
                  {editing ? tt('Salva le modifiche') : t('create.publishBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {editing && (
            <TouchableOpacity style={styles.cancelEditButton} onPress={handleCancelEdit} accessibilityRole="button">
              <Text style={styles.cancelEditText}>{tt('Annulla la modifica')}</Text>
            </TouchableOpacity>
          )}

          {/* Ethical Banner */}
          <View style={styles.ethicalBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#6B7A38" />
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
                <Ionicons name="warning" size={40} color="#F87828" />
              </View>
              <Text style={styles.modalTitle}>{tt('Debito Sociale')}</Text>
            </View>
            
            <Text style={styles.modalText}>{tt('Il tuo saldo di')}{' '}{CURRENCY_NAME}{' '}{tt('è sceso a')}{' '}{user?.granelli || 0}{tt(', superando il limite di debito consentito (')}{DEBT_LIMIT}).
            </Text>

            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoTitle}>{tt('Come tornare in positivo:')}</Text>
              <View style={styles.modalInfoItem}>
                <Ionicons name="gift-outline" size={20} color="#98AA4A" />
                <Text style={styles.modalInfoText}>{tt('Offri favori alla community')}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="heart-outline" size={20} color="#98AA4A" />
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
