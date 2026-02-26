import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Review, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';

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
  const [permission, requestPermission] = useCameraPermissions();
  
  // Review form state
  const [rating, setRating] = useState(5);
  const [kindnessRating, setKindnessRating] = useState(5);
  const [impactRating, setImpactRating] = useState(5);
  const [comment, setComment] = useState('');
  const [publicThanks, setPublicThanks] = useState('');

  useEffect(() => {
    loadFavor();
    checkReviewerStatus();
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
              await loadFavor();
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

  const loadFavor = async () => {
    if (!id) return;
    try {
      const data = await api.getFavor(id, token || undefined);
      setFavor(data);
      
      if (data.status === 'completed') {
        const reviewsData = await api.getFavorReviews(id);
        setReviews(reviewsData);
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile caricare il favore');
      router.back();
    } finally {
      setLoading(false);
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
      await loadFavor();
      
      Alert.alert(
        '🎉 Favore Completato!',
        `Grazie per aver aiutato! Hai guadagnato ${favor.granelli_cost} ${CURRENCY_NAME}.`,
        [{ text: 'Fantastico!', style: 'default' }]
      );
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'QR code non valido');
      setScanningComplete(false);
    }
  };

  const canScanQR = () => {
    if (!favor || !user) return false;
    // Solo chi ha accettato il favore può scansionare
    if (favor.status !== 'accepted') return false;
    // Chi offre scansiona il QR di chi richiede e viceversa
    if (favor.type === 'request') {
      return favor.accepted_by === user.user_id;
    } else {
      return favor.creator_id !== user.user_id && favor.accepted_by === user.user_id;
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
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Accetta',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.acceptFavor(favor.favor_id, token);
              // Naviga direttamente alla chat sostituendo la pagina corrente
              router.replace(`/chat/${favor.favor_id}` as any);
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile accettare il favore');
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
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Completa',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.completeFavor(favor.favor_id, token);
              await refreshUser();
              await loadFavor();
              Alert.alert('Successo', `Favore completato! I ${CURRENCY_NAME} sono stati trasferiti.`);
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile completare il favore');
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
      await loadFavor();
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
    return favor.status === 'accepted' && favor.creator_id === user.user_id;
  };

  const canReview = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'completed') return false;
    const isInvolved = favor.creator_id === user.user_id || favor.accepted_by === user.user_id;
    const hasReviewed = reviews.some(r => r.reviewer_id === user.user_id);
    return isInvolved && !hasReviewed;
  };

  const canViewQR = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'accepted') return false;
    return favor.creator_id === user.user_id || favor.accepted_by === user.user_id;
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
              {favor.type === 'offer' ? 'Offerta' : 'Richiesta'}
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
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {favor.creator_name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>
              {favor.type === 'offer' ? 'Donatore' : 'Richiedente'}
            </Text>
            <Text style={styles.userName}>{favor.creator_name}</Text>
            {favor.creator_title && (
              <Text style={styles.userTitle}>{favor.creator_title}</Text>
            )}
          </View>
        </View>

        {/* Accepted By */}
        {favor.accepted_by_name && (
          <View style={styles.userCard}>
            <View style={[styles.userAvatar, { backgroundColor: '#4ecca3' }]}>
              <Text style={[styles.userAvatarText, { color: '#1a1a2e' }]}>
                {favor.accepted_by_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userLabel}>
                {favor.type === 'offer' ? 'Ricevente' : 'Donatore'}
              </Text>
              <Text style={styles.userName}>{favor.accepted_by_name}</Text>
            </View>
          </View>
        )}

        {/* Location */}
        {(favor.address || favor.approximate_latitude) && (
          <View style={styles.locationCard}>
            <Ionicons name="location" size={20} color="#4ecca3" />
            <Text style={styles.locationText}>
              {favor.address || 'Zona approssimativa disponibile'}
            </Text>
            {favor.distance_km !== undefined && (
              <Text style={styles.distanceText}>{favor.distance_km} km</Text>
            )}
          </View>
        )}

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
            <TouchableOpacity onPress={() => setShowScannerModal(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scansiona QR</Text>
            <View style={{ width: 28 }} />
          </View>
          
          <View style={styles.scannerContent}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanningComplete ? undefined : handleBarCodeScanned}
            />
            
            {/* Scanner Overlay */}
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame}>
                <View style={[styles.scannerCorner, styles.topLeft]} />
                <View style={[styles.scannerCorner, styles.topRight]} />
                <View style={[styles.scannerCorner, styles.bottomLeft]} />
                <View style={[styles.scannerCorner, styles.bottomRight]} />
              </View>
            </View>
          </View>
          
          <View style={styles.scannerFooter}>
            <Ionicons name="qr-code-outline" size={24} color="#4ecca3" />
            <Text style={styles.scannerHint}>
              Inquadra il codice QR mostrato dall'altro utente per completare il favore
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 123, 57, 0.2)',
    borderRadius: 20,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  scannerContent: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#4ecca3',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scannerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: '#1a1a2e',
  },
  scannerHint: {
    flex: 1,
    color: '#a8c4b0',
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    padding: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  offerBadge: {
    backgroundColor: 'rgba(78, 204, 163, 0.3)',
  },
  requestBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  emergencyText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  microBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  microText: {
    color: '#ff9800',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryText: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#aaa',
    lineHeight: 24,
    marginBottom: 20,
  },
  infoCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoSymbol: {
    fontSize: 28,
  },
  infoValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ecca3',
  },
  userInfo: {
    flex: 1,
  },
  userLabel: {
    fontSize: 12,
    color: '#888',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userTitle: {
    fontSize: 12,
    color: '#4ecca3',
    marginTop: 2,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  locationText: {
    color: '#888',
    fontSize: 14,
    flex: 1,
  },
  distanceText: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
  },
  reviewsSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  reviewCard: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    marginBottom: 12,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  ratingsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ratingItem: {
    alignItems: 'center',
  },
  ratingLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  starsContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  starsLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewComment: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  publicThanksBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  publicThanksText: {
    color: '#ccc',
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  reviewForm: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  reviewRatings: {
    marginBottom: 16,
  },
  commentInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    height: 80,
    textAlignVertical: 'top',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelReviewButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#888',
    alignItems: 'center',
  },
  cancelReviewText: {
    color: '#888',
    fontWeight: '600',
  },
  submitReviewButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4ecca3',
    alignItems: 'center',
  },
  submitReviewText: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: 24,
    gap: 12,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ecca3',
    padding: 18,
    borderRadius: 16,
    gap: 10,
  },
  acceptButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffd700',
    padding: 18,
    borderRadius: 16,
    gap: 10,
  },
  completeButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    padding: 14,
    borderRadius: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: '#8e44ad',
    borderStyle: 'dashed',
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    padding: 18,
    borderRadius: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: '#ffd700',
  },
  reviewButtonText: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModalContent: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
  },
  qrModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  qrModalDescription: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
  },
  qrCodeBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#4ecca3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  qrCodeImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  qrCodeText: {
    color: '#666',
    fontSize: 12,
    marginTop: 12,
    fontFamily: 'monospace',
  },
  qrCodeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    backgroundColor: 'rgba(78, 204, 163, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  qrCodeInfoText: {
    color: '#4ecca3',
    fontSize: 12,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkinComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  checkinCompleteText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: '600',
  },
  qrModalClose: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  qrModalCloseText: {
    color: '#fff',
    fontWeight: '600',
  },
});
