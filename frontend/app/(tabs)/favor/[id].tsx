import { avatarColorsForKind } from '../../../src/utils/avatarColor';
import { GranelloIcon } from '../../../src/components/GranelloIcon';
import { earnsGranelli, favorKindFor, granelliFlowLabel } from '../../../src/utils/favorKind';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openPhoneVerificationIfNeeded } from '../../../src/utils/phoneRequired';
import { BrandLogo } from '../../../src/components/BrandLogo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { api, Favor, Review, CURRENCY_NAME } from '../../../src/services/api';
import { QRScanner, useQRPermissions, isCameraAvailable } from '../../../src/components/QRScanner';
import { ReportModal } from '../../../src/components/ReportModal';
import { PublicTrustInfo } from '../../../src/components/profile/PublicTrustInfo';
import { useTranslation } from 'react-i18next';
import { styles } from '../../../src/styles/favorDetail.styles';
import { logger } from '../../../src/utils/logger';
import { notify, showRefusal } from '../../../src/utils/notify';
import { tt, tx } from '../../../src/i18n/tt';
import { FavorCountdown } from '../../../src/components/FavorCountdown';
import { serverDate, serverTime } from '../../../src/utils/serverDate';
import { goBackOrHome } from '../../../src/utils/navigation';
import { editFavorRoute } from '../../../src/utils/favorActions';
import { HEADER_ICON_HIT_SLOP } from '../../../src/utils/touch';
import { formatDistance, getCategoryVisual } from '../../../src/utils/favorVisual';
import colors from '../../../src/theme/colors';
import { modalAnimation } from '../../../src/utils/reducedMotion';

/** La descrizione senza il titolo ripetuto all'inizio (es. «Passaggio alla stazione. Scrivimi…» → «Scrivimi…»). */
const descriptionWithoutTitle = (favor: Pick<Favor, 'title' | 'description'>): string => {
  const title = favor.title.trim();
  const description = (favor.description ?? '').trim();
  if (description.toLowerCase() === title.toLowerCase()) return '';
  if (description.toLowerCase().startsWith(title.toLowerCase())) {
    const rest = description.slice(title.length).replace(/^[\s.,:;!-]+/, '');
    return rest || '';
  }
  return description;
};


const QUICK_THANKS = ['Gentile e puntuale, grazie!', 'Mi hai tolto un pensiero', 'Persona squisita, consigliata', 'Veloce e disponibile'];

export default function FavorDetailScreen() {
  const { id, qr: qrIntent } = useLocalSearchParams<{ id: string; qr?: string }>();
  const { user, token, refreshUser } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [favor, setFavor] = useState<Favor | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);
  const [scanningComplete, setScanningComplete] = useState(false);
  
  // Camera permissions
  const [permission, requestPermission] = useQRPermissions();
  
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Review form state
  const [rating, setRating] = useState(5);
  const [kindnessRating, setKindnessRating] = useState(5);
  const [impactRating, setImpactRating] = useState(5);
  const [comment, setComment] = useState('');
  const [publicThanks, setPublicThanks] = useState('');
  // Granelli già promessi ad altri favori in corso: per accettare un'offerta servono Granelli liberi
  const [committedGranelli, setCommittedGranelli] = useState(0);
  // Ore di oggi già fatte o accettate: il limite giornaliero si controlla quando si accetta
  const [dailyHours, setDailyHours] = useState<{ limit: number; used: number; remaining: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      try {
        logger.debug('Loading favor:', id);
        const data = await api.getFavor(id, token || undefined);
        
        if (!mounted) return;
        
        logger.debug('Favor loaded:', data?.favor_id);
        setFavor(data);
        
        if (data.status === 'completed') {
          try {
            const reviewsData = await api.getFavorReviews(id, token || '');
            if (mounted) {
              setReviews(reviewsData);
            }
          } catch (reviewError) {
            logger.debug('Error loading reviews:', reviewError);
          }
        }
      } catch (error: any) {
        logger.debug('LoadFavor error:', error);
        if (mounted) {
          notify(tt('Errore'), error.message || tt('Impossibile caricare il favore'));
          goBackOrHome(router);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    init();
    
    // Check reviewer status separately
    if (token) {
      api.checkReviewerStatus(token)
        .then(status => {
          if (mounted) setIsReviewer(status.debug_features_enabled || false);
        })
        .catch(() => {
          if (mounted) setIsReviewer(false);
        });
    }
    
    return () => {
      mounted = false;
    };
  }, [id]);

  const checkReviewerStatus = async () => {
    if (!token) return;
    try {
      const status = await api.checkReviewerStatus(token);
      setIsReviewer(status.debug_features_enabled || false);
    } catch (error) {
      // Non è un reviewer o l'endpoint non esiste
      setIsReviewer(false);
    }
  };

  // Il profilo si apre in una schermata a parte, con la barra sempre visibile
  const handleViewProfile = (userId: string, _userName: string) => {
    router.push(`/vicino/${userId}` as any);
  };

  const handleReportFavor = () => {
    if (!user) {
      notify(tt('Errore'), tt('Devi essere loggato per segnalare'));
      return;
    }
    setShowReportModal(true);
  };

  const handleMockQRScan = async () => {
    if (!token || !favor) return;
    
    Alert.alert(
      tt('🔧 Debug Mode'),
      tt('Simulare una scansione QR per completare questo favore?'),
      [
        { text: tt('Annulla'), style: 'cancel' },
        {
          text: tt('Simula QR'),
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.mockQRScan(favor.favor_id, token);
              await refreshUser();
              await reloadFavor();
              notify(tt('✅ Debug'), tt('QR scan simulato con successo! Favore completato.'));
            } catch (error: any) {
              notify(tt('Errore'), error.message || tt('Impossibile simulare QR scan'));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Reload favor data (for after actions like accepting, completing, etc.)
  const reloadFavor = async () => {
    if (!id) return;
    try {
      const data = await api.getFavor(id, token || undefined);
      setFavor(data);
      if (data.status === 'completed') {
        const reviewsData = await api.getFavorReviews(id, token || '');
        setReviews(reviewsData);
      }
    } catch (error) {
      logger.debug('Reload error:', error);
    }
  };

  // Chi arriva dalla chat o da "I Miei" con ?qr=show / ?qr=scan trova subito il QR da mostrare o la fotocamera
  const qrIntentHandled = useRef(false);
  useEffect(() => {
    if (qrIntentHandled.current || !favor || !user || !qrIntent || favor.status !== 'accepted') return;
    qrIntentHandled.current = true;
    if (qrIntent === 'show' && canViewQR()) loadQRCode();
    if (qrIntent === 'scan' && canScanQR()) openScanner();
  }, [favor, user, qrIntent]);

  // Mentre il QR è sul telefono, si controlla ogni 3 secondi se l'altra persona lo ha scansionato
  useEffect(() => {
    if (!showQRModal) return undefined;
    const timer = setInterval(() => { reloadFavor(); }, 3000);
    return () => clearInterval(timer);
  }, [showQRModal, id]);

  // Appena il favore risulta completato, chi mostrava il QR passa subito alla recensione
  useEffect(() => {
    if (showQRModal && favor?.status === 'completed') {
      setShowQRModal(false);
      refreshUser();
      notify(tt('🎉 Favore Completato!'), tt('Ora lascia una recensione.'));
      setShowReviewForm(true);
    }
  }, [favor?.status, showQRModal]);

  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrInstructions, setQrInstructions] = useState<string>('');

  const loadQRCode = async () => {
    if (!token || !favor) return;
    try {
      const data = await api.getFavorQR(favor.favor_id, token);
      setQrCode(data.qr_code);
      setQrImage(data.qr_image);
      setQrInstructions(data.instructions);
      setShowQRModal(true);
    } catch (error: any) {
      notify(tt('Errore'), error.message);
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        notify(
          tt('Permesso negato'),
          tt('È necessario il permesso per usare la fotocamera per scansionare il QR.')
        );
        return;
      }
    }
    setScanningComplete(false);
    setShowScannerModal(true);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanningComplete || !token || !favor) return;
    
    setScanningComplete(true);
    Vibration.vibrate(100);
    
    try {
      // Verifica che il QR code corrisponda al favore
      const response = await api.verifyAndCompleteQR(favor.favor_id, data, token);
      
      setShowScannerModal(false);
      await refreshUser();
      await reloadFavor();
      
      // Subito dopo si apre in automatico il modulo della recensione
      notify(
        tt('🎉 Favore Completato!'),
        favor.type === 'request'
          ? tx('Grazie! Hai speso {0} {1}.', [favor.granelli_cost, CURRENCY_NAME])
          : tx('Grazie! Hai guadagnato {0} {1}.', [favor.granelli_cost, CURRENCY_NAME]),
      );
      setShowReviewForm(true);
    } catch (error: any) {
      setShowScannerModal(false);
      setScanningComplete(false);
      
      // Messaggio di errore più chiaro
      let errorMessage = 'QR code non valido';
      if (error.message) {
        if (error.message.includes('network') || error.message.includes('Network') || error.message.includes('fetch')) {
          errorMessage = 'Errore di connessione. Verifica la tua connessione internet e riprova.';
        } else if (error.message.includes('QR')) {
          errorMessage = error.message;
        } else {
          errorMessage = error.message;
        }
      }
      
      setTimeout(() => {
        Alert.alert(
          tt('Errore Scansione'),
          errorMessage,
          [
            { text: tt('Riprova'), onPress: () => {
              setScanningComplete(false);
              setShowScannerModal(true);
            }},
            { text: tt('Chiudi'), style: 'cancel' }
          ]
        );
      }, 300);
    }
  };

  const canScanQR = () => {
    // Solo chi ESEGUE il favore può scansionare il QR
    if (!favor || !user) return false;
    if (favor.status !== 'accepted') return false;
    if (favor.type === 'request') {
      // Richiesta: chi accetta esegue → scansiona QR
      return favor.accepted_by === user.user_id;
    } else {
      // Offerta: il creatore esegue → scansiona QR
      return favor.creator_id === user.user_id;
    }
  };

  const handleAccept = async () => {
    if (!token || !favor) return;
    
    Alert.alert(
      tt('Conferma'),
      favor.type === 'offer'
        ? tx('Accettando di ricevere questo favore, pagherai {0} {1} al completamento.', [favor.granelli_cost, CURRENCY_NAME])
        : tx('Accettando di donare questo favore, riceverai {0} {1} al completamento.', [favor.granelli_cost, CURRENCY_NAME]),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('favor.accept'),
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.acceptFavor(favor.favor_id, token);
              refreshUser(); // primo favore accettato: si aprono Quartiere, Messaggi e I Miei
              // Naviga direttamente alla chat sostituendo la pagina corrente
              router.replace(`/chat/${favor.favor_id}` as any);
            } catch (error: any) {
              if (!openPhoneVerificationIfNeeded(error, router)) {
                showRefusal(t('common.error'), error.message || t('favor.errorAccept'), tt('Ho capito'));
              }
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmitReview = async () => {
    if (!token || !favor) return;
    
    setActionLoading(true);
    try {
      await api.createReview(
        favor.favor_id,
        rating,
        kindnessRating,
        impactRating,
        comment || undefined,
        publicThanks || undefined,
        token
      );
      setShowReviewForm(false);
      await reloadFavor();
      notify(tt('Grazie!'), tt('La tua recensione è stata pubblicata.'));
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile pubblicare la recensione'));
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !user || favor?.type !== 'offer') return;
    api.getMyFavors(token).then((mine) => {
      const total = mine
        .filter((item) => item.status === 'accepted'
          && ((item.type === 'request' && item.creator_id === user.user_id)
            || (item.type === 'offer' && item.accepted_by === user.user_id)))
        .reduce((sum, item) => sum + (item.granelli_cost || 1), 0);
      setCommittedGranelli(total);
    }).catch(() => setCommittedGranelli(0));
  }, [token, user?.user_id, favor?.type, favor?.favor_id]);
  useEffect(() => {
    if (!token) return;
    api.getDailyHours(token).then(setDailyHours).catch(() => setDailyHours(null));
  }, [token, favor?.favor_id]);
  const freeGranelli = Math.max(0, (user?.granelli || 0) - committedGranelli);

  // Scaduto mentre la pagina era aperta: il conto alla rovescia lo segnala e il tasto Accetta sparisce
  const [expiredWhileOpen, setExpiredWhileOpen] = useState(false);
  const markExpired = useCallback(() => setExpiredWhileOpen(true), []);
  const isExpiredNow = expiredWhileOpen || (!!favor?.expires_at && serverTime(favor.expires_at) <= Date.now());

  const isOwnOpenFavor = !!favor && !!user && favor.creator_id === user.user_id && favor.status === 'active' && !favor.accepted_by;
  const handleCancelOwn = () => {
    if (!token || !favor) return;
    Alert.alert(t('common.confirm'), tt('Sei sicuro di voler cancellare questo favore?'), [
      { text: tt('No'), style: 'cancel' },
      {
        text: tt('Sì, cancella'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelFavor(favor.favor_id, token);
            router.push('/(tabs)/my-favors' as any);
          } catch (error: any) {
            notify(t('common.error'), error.message || t('favor.errorAccept'));
          }
        },
      },
    ]);
  };

  const canAccept = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'active') return false;
    if (isExpiredNow) return false;
    if (favor.creator_id === user.user_id) return false;
    if (favor.type === 'offer' && (user.granelli || 0) < favor.granelli_cost) return false;
    return true;
  };

  const canReview = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'completed') return false;
    const isInvolved = favor.creator_id === user.user_id || favor.accepted_by === user.user_id;
    const hasReviewed = reviews.some(r => r.reviewer_id === user.user_id);
    return isInvolved && !hasReviewed;
  };

  const canViewQR = () => {
    // Solo chi RICEVE il favore può mostrare il QR
    if (!user || !favor) return false;
    if (favor.status !== 'accepted') return false;
    if (favor.type === 'request') {
      // Richiesta: il creatore riceve → mostra QR
      return favor.creator_id === user.user_id;
    } else {
      // Offerta: chi accetta riceve → mostra QR
      return favor.accepted_by === user.user_id;
    }
  };

  const canChat = () => {
    if (!user || !favor) return false;
    if (favor.status === 'cancelled' || favor.status === 'completed') return false;
    // Nel proprio favore l'icona non serve: la chat si apre da "I Miei" e dai Messaggi
    if (favor.creator_id === user.user_id) return false;
    return favor.accepted_by === user.user_id;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return colors.primary;
      case 'accepted': return colors.primary;
      case 'completed': return colors.primary;
      case 'cancelled': return colors.accent;
      default: return colors.textMuted;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Attivo';
      case 'accepted': return 'Accettato';
      case 'completed': return 'Completato';
      case 'cancelled': return 'Cancellato';
      default: return status;
    }
  };

  const renderStars = (value: number, onChange?: (v: number) => void, label?: string) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          onPress={() => onChange && onChange(i)}
          disabled={!onChange}
        >
          <Ionicons
            name={i <= value ? 'star' : 'star-outline'}
            size={onChange ? 28 : 18}
            color={colors.primary}
          />
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.starsContainer}>
        {label && <Text style={styles.starsLabel}>{label}</Text>}
        <View style={styles.starsRow}>{stars}</View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!favor) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{tt('Favore non trovato')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Arancione e regalo = dono, oliva e mano = ricevo (come nelle schede della Home)
  const isGiveKind = favor.creator_id === user?.user_id ? favor.type === 'offer' : favor.type === 'request';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrHome(router)} hitSlop={HEADER_ICON_HIT_SLOP} accessibilityRole="button" accessibilityLabel={tt('Indietro')}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <BrandLogo />
        </View>
        <Text style={styles.headerTitle}>{tt('Dettagli Favore')}</Text>
        <View style={styles.headerActions}>
          {canChat() && (
            <TouchableOpacity 
              style={styles.chatButton} 
              onPress={() => router.push(`/chat/${favor.favor_id}` as any)}
              hitSlop={HEADER_ICON_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tt('Apri la chat')}
              data-testid="chat-button"
            >
              <Ionicons name="chatbubble" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
          {canViewQR() && (
            <TouchableOpacity style={styles.qrButton} onPress={loadQRCode} hitSlop={HEADER_ICON_HIT_SLOP} accessibilityRole="button" accessibilityLabel={tt('Mostra il QR')}>
              <Ionicons name="qr-code" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
          {canScanQR() && (
            <TouchableOpacity style={styles.scanButton} onPress={openScanner} hitSlop={HEADER_ICON_HIT_SLOP} accessibilityRole="button" accessibilityLabel={tt('Scansiona il QR')}>
              <Ionicons name="scan" size={24} color={colors.accent} />
            </TouchableOpacity>
          )}
          {/* Report Favor Button */}
          {user && favor.creator_id !== user.user_id && (
            <TouchableOpacity 
              style={styles.reportButton} 
              onPress={handleReportFavor}
              hitSlop={HEADER_ICON_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tt('Segnala il favore')}
              data-testid="report-favor-button"
            >
              <Ionicons name="flag" size={24} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Tipo e categoria in una riga, poi subito il titolo */}
        <View style={styles.kindRow}>
          <Text style={[styles.kindText, { color: isGiveKind ? colors.accent : colors.lime }]}>
            {tt(`${favorKindFor(favor, user?.user_id)} un favore`).toUpperCase()}
          </Text>
          <Text style={styles.kindSeparator}>·</Text>
          <Text style={styles.kindEmoji}>{getCategoryVisual(favor.category).emoji}</Text>
          <Text style={styles.kindCategory}>{tt(favor.category)}</Text>
          {favor.status !== 'active' && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(favor.status) + '30' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(favor.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(favor.status) }]}>{getStatusText(favor.status)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.title}>{favor.title}</Text>

        {/* Granelli, ore e distanza in una riga sola */}
        <View style={styles.factsRow}>
          <GranelloIcon size={16} />
          <Text style={styles.factStrong}>{tt(granelliFlowLabel(favor, user?.user_id))} {favor.granelli_cost}</Text>
          <Text style={styles.kindSeparator}>·</Text>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          <Text style={styles.factText}>{favor.duration_hours} {favor.duration_hours === 1 ? tt('ora') : tt('ore')}</Text>
          {typeof favor.distance_km === 'number' && (
            <>
              <Text style={styles.kindSeparator}>·</Text>
              <Text style={styles.factText}>{formatDistance(favor.distance_km)}</Text>
            </>
          )}
        </View>

        {favor.expires_at && favor.status === 'active' && !favor.accepted_by && (
          <FavorCountdown
            expiresAt={favor.expires_at}
            earns={earnsGranelli(favor, user?.user_id)}
            granelli={favor.granelli_cost}
            variant="banner"
            onExpire={markExpired}
          />
        )}

        {descriptionWithoutTitle(favor) !== '' && (
          <Text style={styles.description}>{descriptionWithoutTitle(favor)}</Text>
        )}

        {/* Un tuo favore ancora aperto: invece della tua scheda, i tasti per modificarlo o annullarlo */}
        {isOwnOpenFavor ? (
          <View style={styles.ownActions}>
            <TouchableOpacity
              style={styles.ownActionButton}
              onPress={() => router.push(editFavorRoute(favor) as any)}
              accessibilityRole="button"
              accessibilityLabel={tt('Modifica il favore')}
            >
              <Ionicons name="create-outline" size={18} color={colors.lime} />
              <Text style={styles.ownActionText}>{tt('Modifica')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ownActionButton}
              onPress={handleCancelOwn}
              accessibilityRole="button"
              accessibilityLabel={tt('Annulla il favore')}
            >
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={[styles.ownActionText, { color: colors.error }]}>{tt('Annulla il favore')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
          {/* Creator Info */}
          <TouchableOpacity 
            style={styles.userCard}
            onPress={() => handleViewProfile(favor.creator_id, favor.creator_name || 'Utente')}
            activeOpacity={0.7}
          >
            <View style={[styles.userAvatar, { backgroundColor: avatarColorsForKind(earnsGranelli(favor, user?.user_id)).backgroundColor }]}>
              <Text style={[styles.userAvatarText, { color: avatarColorsForKind(earnsGranelli(favor, user?.user_id)).color }]}>
                {favor.creator_name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userLabel}>
                {favor.type === 'offer' ? tt('Donatore') : tt('Ricevente')}
              </Text>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{favor.creator_name}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
              {favor.creator_title && (
                <Text style={styles.userTitle}>{tt(favor.creator_title)}</Text>
              )}
            </View>
          </TouchableOpacity>
          </>
        )}

        {/* Accepted By */}
        {favor.accepted_by_name && favor.accepted_by && (
          <TouchableOpacity 
            style={styles.userCard}
            onPress={() => handleViewProfile(favor.accepted_by!, favor.accepted_by_name || 'Utente')}
            activeOpacity={0.7}
          >
            <View style={[styles.userAvatar, { backgroundColor: avatarColorsForKind(earnsGranelli(favor, user?.user_id)).backgroundColor }]}>
              <Text style={[styles.userAvatarText, { color: avatarColorsForKind(earnsGranelli(favor, user?.user_id)).color }]}>
                {favor.accepted_by_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userLabel}>
                {favor.type === 'offer' ? tt('Ricevente') : tt('Donatore')}
              </Text>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{favor.accepted_by_name}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Location - Hidden for privacy, only visible on map */}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.reviewsSection}>
            <Text style={styles.sectionTitle}>{tt('Recensioni')}</Text>
            {reviews.map((review) => (
              <View key={review.review_id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{review.reviewer_name}</Text>
                </View>
                <View style={styles.ratingsGrid}>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>{tt('Efficienza')}</Text>
                    <View style={styles.starsRow}>
                      {renderStars(review.rating)}
                    </View>
                  </View>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>{tt('Gentilezza')}</Text>
                    <View style={styles.starsRow}>
                      {renderStars(review.kindness_rating)}
                    </View>
                  </View>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>{tt('Impatto')}</Text>
                    <View style={styles.starsRow}>
                      {renderStars(review.impact_rating)}
                    </View>
                  </View>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
                {review.public_thanks && (
                  <View style={styles.publicThanksBox}>
                    <Ionicons name="heart" size={14} color={colors.accent} />
                    <Text style={styles.publicThanksText}>&quot;{review.public_thanks}&quot;</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Review Form */}
        {showReviewForm && (
          <View style={styles.reviewForm}>
            <Text style={styles.sectionTitle}>{tt('Lascia una Recensione')}</Text>
            
            <View style={styles.reviewRatings}>
              {renderStars(rating, setRating, 'Efficienza')}
              {renderStars(kindnessRating, setKindnessRating, 'Gentilezza')}
              {renderStars(impactRating, setImpactRating, 'Impatto Sociale')}
            </View>

            <TextInput
              style={styles.commentInput}
              placeholder={tt('Commento (opzionale)')}
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
              {tt('Il commento sarà visibile sul profilo di chi recensisci, con il tuo nome. Scrivi con rispetto.')}
            </Text>

            <Text style={styles.quickThanksLabel}>{tt('Grazie veloce: tocca una frase')}</Text>
            <View style={styles.quickThanksRow}>
              {QUICK_THANKS.map((phrase) => (
                <TouchableOpacity
                  key={phrase}
                  style={[styles.quickThanksChip, publicThanks === tt(phrase) && styles.quickThanksChipActive]}
                  onPress={() => setPublicThanks(publicThanks === tt(phrase) ? '' : tt(phrase))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: publicThanks === tt(phrase) }}
                >
                  <Text style={[styles.quickThanksText, publicThanks === tt(phrase) && styles.quickThanksTextActive]}>{tt(phrase)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.commentInput, { marginTop: 12 }]}
              placeholder={tt('Ringraziamento pubblico (opzionale - apparirà nella Bacheca dei Grazie)')}
              placeholderTextColor={colors.textMuted}
              value={publicThanks}
              onChangeText={setPublicThanks}
              multiline
              numberOfLines={2}
            />

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.cancelReviewButton}
                onPress={() => setShowReviewForm(false)}
              >
                <Text style={styles.cancelReviewText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitReviewButton}
                onPress={handleSubmitReview}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.submitReviewText}>{tt('Pubblica')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {canAccept() && dailyHours && (dailyHours.remaining < favor.duration_hours || dailyHours.used >= dailyHours.limit - 3) && (
            <Text
              style={[styles.acceptHint, { fontWeight: '700' }, dailyHours.remaining < favor.duration_hours && { color: colors.accent }]}
              data-testid="daily-hours-line"
            >
              {dailyHours.remaining < favor.duration_hours
                ? tx('Oggi hai già {0} ore su {1}: questo favore ne richiede {2}. Riprova domani.', [dailyHours.used, dailyHours.limit, favor.duration_hours])
                : tx('Oggi hai già {0} ore su {1} tra favori fatti e accettati', [dailyHours.used, dailyHours.limit])}
            </Text>
          )}
          {canAccept() && favor.type === 'offer' && (
            <Text
              style={[styles.acceptHint, { fontWeight: '700' }, freeGranelli < favor.granelli_cost && { color: colors.accent }]}
              data-testid="accept-cost-line"
            >
              {tx('Per accettare ti servono {0} {1}: ne hai {2} liberi', [favor.granelli_cost, CURRENCY_NAME, freeGranelli])}
              {committedGranelli > 0 ? tx(' ({0} già impegnati)', [committedGranelli]) : ''}
            </Text>
          )}
          {canAccept() && (
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                  <Text style={styles.acceptButtonText}>{tt('Accetta Favore')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canAccept() && (
            <Text style={styles.acceptHint}>{tt('Dopo l\'accettazione si apre la chat per accordarvi. All\'incontro scansionate il codice QR per completare il favore.')}</Text>
          )}

          {/* Si completa solo con il QR: chi riceve il favore lo mostra, chi lo esegue lo scansiona */}
          {favor.status === 'accepted' && canViewQR() && (
            <TouchableOpacity
              style={styles.scanQRButton}
              onPress={loadQRCode}
              disabled={actionLoading}
              data-testid="show-qr-button"
            >
              <Ionicons name="qr-code" size={20} color={colors.background} />
              <Text style={styles.scanQRButtonText}>{tt('Mostra il QR per completare')}</Text>
            </TouchableOpacity>
          )}

          {/* Real QR Scanner Button - Shows for both reviewer and normal users */}
          {favor.status === 'accepted' && canScanQR() && (
            <TouchableOpacity
              style={styles.scanQRButton}
              onPress={openScanner}
              disabled={actionLoading}
              data-testid="scan-qr-button"
            >
              <Ionicons name="scan" size={20} color={colors.background} />
              <Text style={styles.scanQRButtonText}>{tt('Scansiona QR per Completare')}</Text>
            </TouchableOpacity>
          )}

          {canReview() && !showReviewForm && (
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => setShowReviewForm(true)}
            >
              <Ionicons name="star" size={20} color={colors.primary} />
              <Text style={styles.reviewButtonText}>{tt('Lascia una Recensione')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {favor.created_at && (
          <Text style={styles.createdFooter}>
            {tt('Pubblicato il')}{' '}{serverDate(favor.created_at).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Ionicons name="heart-circle" size={32} color={colors.primary} />
              <Text style={styles.qrModalTitle}>{tt('Check-in QR')}</Text>
            </View>
            
            <Text style={styles.qrModalDescription}>
              {qrInstructions || tt('Mostra questo codice all\'altra persona per completare il favore')}
            </Text>
            
            <View style={styles.qrCodeBox}>
              {qrImage ? (
                <Image 
                  source={{ uri: qrImage }} 
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="qr-code" size={120} color={colors.primary} />
              )}
            </View>
            
            <View style={styles.qrCodeInfo}>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
              <Text style={styles.qrCodeInfoText}>{tt('Codice sicuro monouso')}</Text>
            </View>

            {favor?.checkin_completed && (
              <View style={styles.checkinComplete}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                <Text style={styles.checkinCompleteText}>{tt('Check-in completato!')}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.qrModalClose}
              onPress={() => setShowQRModal(false)}
            >
              <Text style={styles.qrModalCloseText}>{tt('Chiudi')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showScannerModal} animationType={modalAnimation()}>
        <SafeAreaView style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity 
              onPress={() => {
                setScanningComplete(false);
                setShowScannerModal(false);
              }}
              style={styles.scannerCloseButton}
            >
              <Ionicons name="close-circle" size={32} color={colors.accent} />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>{tt('Scansiona QR')}</Text>
            <View style={{ width: 32 }} />
          </View>
          
          <View style={styles.scannerContent}>
            {permission?.granted && isCameraAvailable() ? (
              <QRScanner 
                onBarcodeScanned={handleBarCodeScanned}
                scanningComplete={scanningComplete}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
                <Text style={styles.cameraPlaceholderText}>
                  {isCameraAvailable() ? tt('Permesso fotocamera non concesso') : tt('Fotocamera non disponibile')}
                </Text>
                {isCameraAvailable() && (
                  <TouchableOpacity 
                    style={styles.retryPermissionButton}
                    onPress={async () => {
                      const result = await requestPermission();
                      if (!result.granted) {
                        notify(tt('Errore'), tt('È necessario il permesso per la fotocamera'));
                      }
                    }}
                  >
                    <Text style={styles.retryPermissionText}>{tt('Riprova')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {/* Scanner Overlay */}
            {permission?.granted && (
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame}>
                  <View style={[styles.scannerCorner, styles.topLeft]} />
                  <View style={[styles.scannerCorner, styles.topRight]} />
                  <View style={[styles.scannerCorner, styles.bottomLeft]} />
                  <View style={[styles.scannerCorner, styles.bottomRight]} />
                </View>
              </View>
            )}
          </View>
          
          <View style={styles.scannerFooter}>
            <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
            <Text style={styles.scannerHint}>{tt('Inquadra il codice QR mostrato dall\'altro utente per completare il favore')}</Text>
          </View>
          
          {/* Cancel Button */}
          <TouchableOpacity 
            style={styles.scannerCancelButton}
            onPress={() => {
              setScanningComplete(false);
              setShowScannerModal(false);
            }}
          >
            <Text style={styles.scannerCancelText}>{tt('Annulla')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Report Favor Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={favor?.favor_id || ''}
        reportType="favor"
        targetName={favor?.title || 'Favore'}
        token={token || ''}
      />

    </SafeAreaView>
  );
}
