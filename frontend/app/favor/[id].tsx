import React, { useState, useEffect, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Review, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import { QRScanner, useQRPermissions, isCameraAvailable } from '../../src/components/QRScanner';
import { ReportModal } from '../../src/components/ReportModal';
import { useTranslation } from 'react-i18next';
import { styles } from '../../src/styles/favorDetail.styles';
import { logger } from '../../src/utils/logger';

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'heart-circle',
  'Spesa': 'heart',
  'Tecnologia': 'heart-half',
  'Pulizie': 'home',
  'Compagnia': 'people',
  'Cucina': 'heart-circle-outline',
  'Giardinaggio': 'leaf',
  'Consiglio': 'bulb',
  'Informazione': 'information-circle',
  'Aiuto Rapido': 'flash',
  'Altro': 'ellipsis-horizontal',
};

export default function FavorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // Review form state
  const [rating, setRating] = useState(5);
  const [kindnessRating, setKindnessRating] = useState(5);
  const [impactRating, setImpactRating] = useState(5);
  const [comment, setComment] = useState('');
  const [publicThanks, setPublicThanks] = useState('');

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
            const reviewsData = await api.getFavorReviews(id);
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
          Alert.alert('Errore', error.message || 'Impossibile caricare il favore');
          router.back();
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

  const handleViewProfile = async (userId: string, userName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setShowProfileModal(true);
    setLoadingProfile(true);
    
    try {
      const profile = await api.getUserPublicProfile(userId, token || undefined);
      setUserProfile(profile);
      const reviews = await api.getUserReviews(userId);
      setUserReviews(reviews);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleReportFavor = () => {
    if (!user) {
      Alert.alert('Errore', 'Devi essere loggato per segnalare');
      return;
    }
    setShowReportModal(true);
  };

  const handleMockQRScan = async () => {
    if (!token || !favor) return;
    
    Alert.alert(
      '🔧 Debug Mode',
      'Simulare una scansione QR per completare questo favore?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Simula QR',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.mockQRScan(favor.favor_id, token);
              await refreshUser();
              await reloadFavor();
              Alert.alert('✅ Debug', 'QR scan simulato con successo! Favore completato.');
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile simulare QR scan');
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
        const reviewsData = await api.getFavorReviews(id);
        setReviews(reviewsData);
      }
    } catch (error) {
      logger.debug('Reload error:', error);
    }
  };

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
      Alert.alert('Errore', error.message);
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Permesso negato',
          'È necessario il permesso per usare la fotocamera per scansionare il QR.'
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
      
      // Apri automaticamente il form recensione (obbligatorio)
      Alert.alert(
        '🎉 Favore Completato!',
        `Grazie! Hai ${favor.type === 'request' ? 'speso' : 'guadagnato'} ${favor.granelli_cost} ${CURRENCY_NAME}.\n\nOra lascia una recensione per completare!`,
        [{ 
          text: 'Lascia Recensione', 
          style: 'default',
          onPress: () => setShowReviewForm(true)
        }]
      );
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
          'Errore Scansione',
          errorMessage,
          [
            { text: 'Riprova', onPress: () => {
              setScanningComplete(false);
              setShowScannerModal(true);
            }},
            { text: 'Chiudi', style: 'cancel' }
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
      'Conferma',
      favor.type === 'offer'
        ? `Accettando questa offerta, pagherai ${favor.granelli_cost} ${CURRENCY_NAME} al completamento.`
        : `Accettando questa richiesta, riceverai ${favor.granelli_cost} ${CURRENCY_NAME} al completamento.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('favor.accept'),
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.acceptFavor(favor.favor_id, token);
              // Naviga direttamente alla chat sostituendo la pagina corrente
              router.replace(`/chat/${favor.favor_id}` as any);
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message || t('favor.errorAccept'));
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleComplete = async () => {
    if (!token || !favor) return;
    
    Alert.alert(
      'Conferma Completamento',
      `I ${CURRENCY_NAME} verranno trasferiti. Sei sicuro?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('favor.complete'),
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.completeFavor(favor.favor_id, token);
              await refreshUser();
              await reloadFavor();
              Alert.alert('Successo', `Favore completato! I ${CURRENCY_NAME} sono stati trasferiti.`);
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message || t('favor.errorComplete'));
            } finally {
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
      Alert.alert('Grazie!', 'La tua recensione è stata pubblicata.');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile pubblicare la recensione');
    } finally {
      setActionLoading(false);
    }
  };

  const canAccept = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'active') return false;
    if (favor.creator_id === user.user_id) return false;
    if (favor.type === 'offer' && (user.granelli || 0) < favor.granelli_cost) return false;
    return true;
  };

  const canComplete = () => {
    if (!user || !favor) return false;
    // Solo chi RICEVE il servizio (e paga i granelli) può confermare senza QR
    const payerId = favor.type === 'request' ? favor.creator_id : favor.accepted_by;
    return favor.status === 'accepted' && payerId === user.user_id;
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
    return favor.creator_id === user.user_id || favor.accepted_by === user.user_id;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4ecca3';
      case 'accepted': return '#ffd700';
      case 'completed': return '#4caf50';
      case 'cancelled': return '#ff6b6b';
      default: return '#888';
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
            color="#ffd700"
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
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      </SafeAreaView>
    );
  }

  if (!favor) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Favore non trovato</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dettagli Favore</Text>
        <View style={styles.headerActions}>
          {canChat() && (
            <TouchableOpacity 
              style={styles.chatButton} 
              onPress={() => router.push(`/chat/${favor.favor_id}` as any)}
              data-testid="chat-button"
            >
              <Ionicons name="chatbubble" size={22} color="#4ecca3" />
            </TouchableOpacity>
          )}
          {canViewQR() && (
            <TouchableOpacity style={styles.qrButton} onPress={loadQRCode}>
              <Ionicons name="qr-code" size={24} color="#4ecca3" />
            </TouchableOpacity>
          )}
          {canScanQR() && (
            <TouchableOpacity style={styles.scanButton} onPress={openScanner}>
              <Ionicons name="scan" size={24} color="#E07B39" />
            </TouchableOpacity>
          )}
          {/* Report Favor Button */}
          {user && favor.creator_id !== user.user_id && (
            <TouchableOpacity 
              style={styles.reportButton} 
              onPress={handleReportFavor}
              data-testid="report-favor-button"
            >
              <Ionicons name="flag" size={22} color="#ff6b6b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status and Type */}
        <View style={styles.badgesRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(favor.status) + '30' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(favor.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(favor.status) }]}>
              {getStatusText(favor.status)}
            </Text>
          </View>
          <View style={[styles.typeBadge, favor.type === 'offer' ? styles.offerBadge : styles.requestBadge]}>
            <Ionicons
              name={favor.type === 'offer' ? 'gift' : 'hand-left'}
              size={16}
              color="#fff"
            />
            <Text style={styles.typeText}>
              {favor.type === 'offer' ? t('favor.offer') : t('favor.request')}
            </Text>
          </View>
          {favor.is_emergency && (
            <View style={styles.emergencyBadge}>
              <Ionicons name="alert-circle" size={14} color="#ff6b6b" />
              <Text style={styles.emergencyText}>Urgente</Text>
            </View>
          )}
        </View>

        {/* Category */}
        <View style={styles.categoryContainer}>
          <Ionicons
            name={(CATEGORY_ICONS[favor.category] || 'ellipsis-horizontal') as any}
            size={20}
            color="#4ecca3"
          />
          <Text style={styles.categoryText}>{favor.category}</Text>
        </View>

        {/* Creation Date/Time */}
        <View style={styles.dateTimeContainer}>
          <Ionicons name="calendar-outline" size={16} color="#888" />
          <Text style={styles.dateTimeText}>
            Creato il {new Date(favor.created_at || Date.now()).toLocaleDateString('it-IT', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </View>

        {/* Title and Description */}
        <Text style={styles.title}>{favor.title}</Text>
        <Text style={styles.description}>{favor.description}</Text>

        {/* Soli and Duration */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Text style={styles.infoSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.infoValue}>{favor.granelli_cost}</Text>
            <Text style={styles.infoLabel}>{CURRENCY_NAME}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="time" size={24} color="#4ecca3" />
            <Text style={styles.infoValue}>{favor.duration_hours}</Text>
            <Text style={styles.infoLabel}>ore</Text>
          </View>
        </View>

        {/* Creator Info */}
        <TouchableOpacity 
          style={styles.userCard}
          onPress={() => handleViewProfile(favor.creator_id, favor.creator_name || 'Utente')}
          activeOpacity={0.7}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {favor.creator_name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>
              {favor.type === 'offer' ? 'Donatore' : 'Richiedente'}
            </Text>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{favor.creator_name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#888" />
            </View>
            {favor.creator_title && (
              <Text style={styles.userTitle}>{favor.creator_title}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Accepted By */}
        {favor.accepted_by_name && favor.accepted_by && (
          <TouchableOpacity 
            style={styles.userCard}
            onPress={() => handleViewProfile(favor.accepted_by!, favor.accepted_by_name || 'Utente')}
            activeOpacity={0.7}
          >
            <View style={[styles.userAvatar, { backgroundColor: '#4ecca3' }]}>
              <Text style={[styles.userAvatarText, { color: '#1a1a2e' }]}>
                {favor.accepted_by_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userLabel}>
                {favor.type === 'offer' ? 'Ricevente' : 'Donatore'}
              </Text>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{favor.accepted_by_name}</Text>
                <Ionicons name="chevron-forward" size={16} color="#888" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Location - Hidden for privacy, only visible on map */}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.reviewsSection}>
            <Text style={styles.sectionTitle}>Recensioni</Text>
            {reviews.map((review) => (
              <View key={review.review_id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{review.reviewer_name}</Text>
                </View>
                <View style={styles.ratingsGrid}>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>Efficienza</Text>
                    <View style={styles.starsRow}>
                      {renderStars(review.rating)}
                    </View>
                  </View>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>Gentilezza</Text>
                    <View style={styles.starsRow}>
                      {renderStars(review.kindness_rating)}
                    </View>
                  </View>
                  <View style={styles.ratingItem}>
                    <Text style={styles.ratingLabel}>Impatto</Text>
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
                    <Ionicons name="heart" size={14} color="#ff6b6b" />
                    <Text style={styles.publicThanksText}>"{review.public_thanks}"</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Review Form */}
        {showReviewForm && (
          <View style={styles.reviewForm}>
            <Text style={styles.sectionTitle}>Lascia una Recensione</Text>
            
            <View style={styles.reviewRatings}>
              {renderStars(rating, setRating, 'Efficienza')}
              {renderStars(kindnessRating, setKindnessRating, 'Gentilezza')}
              {renderStars(impactRating, setImpactRating, 'Impatto Sociale')}
            </View>

            <TextInput
              style={styles.commentInput}
              placeholder="Commento (opzionale)"
              placeholderTextColor="#666"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />

            <TextInput
              style={[styles.commentInput, { marginTop: 12 }]}
              placeholder="Ringraziamento pubblico (opzionale - apparirà nella Bacheca dei Grazie)"
              placeholderTextColor="#666"
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
                <Text style={styles.cancelReviewText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitReviewButton}
                onPress={handleSubmitReview}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : (
                  <Text style={styles.submitReviewText}>Pubblica</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {canAccept() && (
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#1a1a2e" />
                  <Text style={styles.acceptButtonText}>Accetta Favore</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canComplete() && (
            <TouchableOpacity
              style={styles.completeButton}
              onPress={handleComplete}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <>
                  <Ionicons name="trophy" size={20} color="#1a1a2e" />
                  <Text style={styles.completeButtonText}>Segna come Completato</Text>
                </>
              )}
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
              <Ionicons name="scan" size={20} color="#fff" />
              <Text style={styles.scanQRButtonText}>Scansiona QR per Completare</Text>
            </TouchableOpacity>
          )}

          {canReview() && !showReviewForm && (
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => setShowReviewForm(true)}
            >
              <Ionicons name="star" size={20} color="#ffd700" />
              <Text style={styles.reviewButtonText}>Lascia una Recensione</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Ionicons name="heart-circle" size={32} color="#4ecca3" />
              <Text style={styles.qrModalTitle}>Check-in QR</Text>
            </View>
            
            <Text style={styles.qrModalDescription}>
              {qrInstructions || 'Mostra questo codice all\'altra persona per completare il favore'}
            </Text>
            
            <View style={styles.qrCodeBox}>
              {qrImage ? (
                <Image 
                  source={{ uri: qrImage }} 
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="qr-code" size={120} color="#4ecca3" />
              )}
            </View>
            
            <View style={styles.qrCodeInfo}>
              <Ionicons name="shield-checkmark" size={16} color="#4ecca3" />
              <Text style={styles.qrCodeInfoText}>Codice sicuro monouso</Text>
            </View>

            {favor?.checkin_completed && (
              <View style={styles.checkinComplete}>
                <Ionicons name="checkmark-circle" size={24} color="#4ecca3" />
                <Text style={styles.checkinCompleteText}>Check-in completato!</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.qrModalClose}
              onPress={() => setShowQRModal(false)}
            >
              <Text style={styles.qrModalCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showScannerModal} animationType="slide">
        <SafeAreaView style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity 
              onPress={() => {
                setScanningComplete(false);
                setShowScannerModal(false);
              }}
              style={styles.scannerCloseButton}
            >
              <Ionicons name="close-circle" size={32} color="#ff6b6b" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scansiona QR</Text>
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
                <Ionicons name="camera-outline" size={64} color="#666" />
                <Text style={styles.cameraPlaceholderText}>
                  {isCameraAvailable() ? 'Permesso fotocamera non concesso' : 'Fotocamera non disponibile'}
                </Text>
                {isCameraAvailable() && (
                  <TouchableOpacity 
                    style={styles.retryPermissionButton}
                    onPress={async () => {
                      const result = await requestPermission();
                      if (!result.granted) {
                        Alert.alert('Errore', 'È necessario il permesso per la fotocamera');
                      }
                    }}
                  >
                    <Text style={styles.retryPermissionText}>Riprova</Text>
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
            <Ionicons name="qr-code-outline" size={24} color="#4ecca3" />
            <Text style={styles.scannerHint}>
              Inquadra il codice QR mostrato dall'altro utente per completare il favore
            </Text>
          </View>
          
          {/* Cancel Button */}
          <TouchableOpacity 
            style={styles.scannerCancelButton}
            onPress={() => {
              setScanningComplete(false);
              setShowScannerModal(false);
            }}
          >
            <Text style={styles.scannerCancelText}>Annulla</Text>
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

      {/* User Profile Modal */}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalContent}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Profilo Utente</Text>
              <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {loadingProfile ? (
              <ActivityIndicator size="large" color="#4ecca3" style={{ marginTop: 40 }} />
            ) : userProfile ? (
              <ScrollView style={styles.profileModalScroll}>
                {/* Profile Header */}
                <View style={styles.profileHeader}>
                  <View style={styles.profileAvatar}>
                    {userProfile.picture ? (
                      <Image source={{ uri: userProfile.picture }} style={styles.profileAvatarImage} />
                    ) : (
                      <Text style={styles.profileAvatarText}>
                        {userProfile.name?.charAt(0).toUpperCase() || 'U'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.profileName}>{userProfile.name}</Text>
                  <Text style={styles.profileTitle}>{userProfile.title}</Text>
                  {userProfile.is_supporter && (
                    <View style={styles.supporterBadgeSmall}>
                      <Ionicons name="heart" size={12} color="#ff6b6b" />
                      <Text style={styles.supporterBadgeText}>Sostenitore</Text>
                    </View>
                  )}
                </View>

                {/* Stats */}
                <View style={styles.profileStats}>
                  <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>{userProfile.total_favors_given}</Text>
                    <Text style={styles.profileStatLabel}>Favori dati</Text>
                  </View>
                  <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>{userProfile.total_favors_received}</Text>
                    <Text style={styles.profileStatLabel}>Favori ricevuti</Text>
                  </View>
                  <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>{userProfile.reviews_count}</Text>
                    <Text style={styles.profileStatLabel}>Recensioni</Text>
                  </View>
                </View>

                {/* Ratings */}
                {(userProfile.average_rating > 0 || userProfile.average_kindness > 0) && (
                  <View style={styles.profileRatings}>
                    <View style={styles.profileRatingItem}>
                      <Text style={styles.profileRatingLabel}>Efficienza</Text>
                      <View style={styles.profileRatingStars}>
                        {[1,2,3,4,5].map(i => (
                          <Ionicons 
                            key={i} 
                            name={i <= Math.round(userProfile.average_rating) ? 'star' : 'star-outline'} 
                            size={16} 
                            color="#ffd700" 
                          />
                        ))}
                      </View>
                    </View>
                    <View style={styles.profileRatingItem}>
                      <Text style={styles.profileRatingLabel}>Gentilezza</Text>
                      <View style={styles.profileRatingStars}>
                        {[1,2,3,4,5].map(i => (
                          <Ionicons 
                            key={i} 
                            name={i <= Math.round(userProfile.average_kindness) ? 'star' : 'star-outline'} 
                            size={16} 
                            color="#ffd700" 
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* Skills */}
                {userProfile.skills && userProfile.skills.length > 0 && (
                  <View style={styles.profileSection}>
                    <Text style={styles.profileSectionTitle}>Competenze</Text>
                    <View style={styles.profileSkills}>
                      {userProfile.skills.map((skill: string, idx: number) => (
                        <View key={idx} style={styles.profileSkillTag}>
                          <Text style={styles.profileSkillText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Reviews */}
                {userReviews.length > 0 && (
                  <View style={styles.profileSection}>
                    <Text style={styles.profileSectionTitle}>Recensioni ricevute</Text>
                    {userReviews.slice(0, 5).map((review) => (
                      <View key={review.review_id} style={styles.profileReviewCard}>
                        <View style={styles.profileReviewHeader}>
                          <Text style={styles.profileReviewerName}>{review.reviewer_name}</Text>
                          <View style={styles.profileReviewStars}>
                            {[1,2,3,4,5].map(i => (
                              <Ionicons 
                                key={i} 
                                name={i <= review.rating ? 'star' : 'star-outline'} 
                                size={12} 
                                color="#ffd700" 
                              />
                            ))}
                          </View>
                        </View>
                        {review.comment && (
                          <Text style={styles.profileReviewComment}>{review.comment}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text style={styles.profileError}>Impossibile caricare il profilo</Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
