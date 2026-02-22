import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, Review } from '../../src/services/api';

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'car',
  'Spesa': 'cart',
  'Tecnologia': 'laptop',
  'Pulizie': 'water',
  'Compagnia': 'people',
  'Cucina': 'restaurant',
  'Giardinaggio': 'leaf',
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
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadFavor();
  }, [id]);

  const loadFavor = async () => {
    if (!id) return;
    try {
      const data = await api.getFavor(id);
      setFavor(data);
      
      // Load reviews if completed
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

  const handleAccept = async () => {
    if (!token || !favor) return;
    
    Alert.alert(
      'Conferma',
      favor.type === 'offer'
        ? `Accettando questa offerta, pagherai ${favor.credits_cost} crediti al completamento.`
        : `Accettando questa richiesta, riceverai ${favor.credits_cost} crediti al completamento.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Accetta',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.acceptFavor(favor.favor_id, token);
              await loadFavor();
              Alert.alert('Successo', 'Hai accettato il favore!');
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile accettare il favore');
            } finally {
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
      'I crediti verranno trasferiti. Sei sicuro?',
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
              Alert.alert('Successo', 'Favore completato! I crediti sono stati trasferiti.');
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
      await api.createReview(favor.favor_id, rating, comment || undefined, token);
      setShowReviewForm(false);
      await loadFavor();
      Alert.alert('Grazie!', 'La tua recensione \u00e8 stata pubblicata.');
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
    if (favor.type === 'offer' && user.credits < favor.credits_cost) return false;
    return true;
  };

  const canComplete = () => {
    if (!user || !favor) return false;
    return favor.status === 'accepted' && favor.creator_id === user.user_id;
  };

  const canReview = () => {
    if (!user || !favor) return false;
    if (favor.status !== 'completed') return false;
    // Check if user is involved and hasn't reviewed yet
    const isInvolved = favor.creator_id === user.user_id || favor.accepted_by === user.user_id;
    const hasReviewed = reviews.some(r => r.reviewer_id === user.user_id);
    return isInvolved && !hasReviewed;
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

  const renderStars = (value: number, interactive: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          onPress={() => interactive && setRating(i)}
          disabled={!interactive}
        >
          <Ionicons
            name={i <= value ? 'star' : 'star-outline'}
            size={interactive ? 32 : 18}
            color="#ffd700"
          />
        </TouchableOpacity>
      );
    }
    return stars;
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
        <View style={{ width: 40 }} />
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

        {/* Credits */}
        <View style={styles.creditsCard}>
          <Ionicons name="star" size={28} color="#ffd700" />
          <View>
            <Text style={styles.creditsValue}>{favor.credits_cost} crediti</Text>
            <Text style={styles.creditsLabel}>
              {favor.type === 'offer' ? 'Paghi al completamento' : 'Ricevi al completamento'}
            </Text>
          </View>
        </View>

        {/* Creator Info */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {favor.creator_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.userLabel}>Creato da</Text>
            <Text style={styles.userName}>{favor.creator_name}</Text>
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
            <View>
              <Text style={styles.userLabel}>Accettato da</Text>
              <Text style={styles.userName}>{favor.accepted_by_name}</Text>
            </View>
          </View>
        )}

        {/* Location */}
        {favor.address && (
          <View style={styles.locationCard}>
            <Ionicons name="location" size={20} color="#4ecca3" />
            <Text style={styles.locationText}>{favor.address}</Text>
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
                  <View style={styles.starsRow}>
                    {renderStars(review.rating)}
                  </View>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Review Form */}
        {showReviewForm && (
          <View style={styles.reviewForm}>
            <Text style={styles.sectionTitle}>Lascia una recensione</Text>
            <View style={styles.starsRow}>
              {renderStars(rating, true)}
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
  content: {
    padding: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
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
    marginBottom: 24,
  },
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 16,
  },
  creditsValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffd700',
  },
  creditsLabel: {
    fontSize: 14,
    color: '#888',
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
  userLabel: {
    fontSize: 12,
    color: '#888',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewComment: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  reviewForm: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  commentInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    marginTop: 16,
    height: 100,
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
});
