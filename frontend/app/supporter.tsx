import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import colors from '../src/theme/colors';

export default function SupporterScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isSupporter, setIsSupporter] = useState(false);
  const [supporterSince, setSupporterSince] = useState<string | null>(null);

  useEffect(() => {
    loadSupporterStatus();
  }, [token]);

  // Check if returning from Stripe checkout
  useEffect(() => {
    if (params.session_id && token) {
      pollPaymentStatus(params.session_id as string);
    }
  }, [params.session_id, token]);

  const loadSupporterStatus = async () => {
    if (!token) return;
    try {
      const status = await api.getMySubscriptionStatus(token);
      setIsSupporter(status.is_supporter);
      setSupporterSince(status.supporter_since);
    } catch (error) {
      console.log('Error loading supporter status:', error);
    }
  };

  const pollPaymentStatus = async (sessionId: string, attempts = 0) => {
    const maxAttempts = 10;
    const pollInterval = 2000;

    if (attempts >= maxAttempts) {
      Alert.alert(
        'Verifica pagamento',
        'Non siamo riusciti a verificare il pagamento. Controlla la tua email per conferma.',
        [{ text: 'OK' }]
      );
      setCheckingStatus(false);
      return;
    }

    setCheckingStatus(true);
    try {
      const status = await api.getCheckoutStatus(sessionId, token!);
      
      if (status.payment_status === 'paid') {
        setCheckingStatus(false);
        setIsSupporter(true);
        await refreshUser();
        
        // Show success modal
        Alert.alert(
          '🎉 Grazie!',
          'Sei ufficialmente un Sostenitore della Community!\n\nDa oggi il tuo profilo brillerà sulla mappa con il badge Cuore Dorato.',
          [{ text: 'Fantastico!', onPress: () => router.replace('/profile') }]
        );
        return;
      } else if (status.status === 'expired') {
        setCheckingStatus(false);
        Alert.alert('Sessione scaduta', 'La sessione di pagamento è scaduta. Riprova.');
        return;
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.log('Payment status check error:', error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  };

  const handleSubscribe = async () => {
    if (!token) {
      Alert.alert('Accedi', 'Devi effettuare l\'accesso per diventare un Sostenitore');
      return;
    }

    setLoading(true);
    try {
      const originUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://community-trades-2.preview.emergentagent.com';
      const result = await api.createSubscriptionCheckout(originUrl, token);
      
      // Open Stripe checkout in browser
      const supported = await Linking.canOpenURL(result.checkout_url);
      if (supported) {
        await Linking.openURL(result.checkout_url);
      } else {
        Alert.alert('Errore', 'Impossibile aprire il checkout');
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore nella creazione del checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!token) return;
    try {
      const result = await api.getSubscriptionManageUrl(token);
      const supported = await Linking.canOpenURL(result.manage_url);
      if (supported) {
        await Linking.openURL(result.manage_url);
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore nel caricamento del portale');
    }
  };

  if (checkingStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Verifica pagamento in corso...</Text>
          <Text style={styles.loadingSubtext}>Non chiudere questa schermata</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sostieni il Progetto</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heartIcon}>
            <Ionicons name="heart" size={60} color="#ffd700" />
          </View>
          <Text style={styles.heroTitle}>Diventa un Pilastro{'\n'}della Community</Text>
          <Text style={styles.heroSubtitle}>
            Il tuo supporto mantiene l'app gratuita, sicura e senza pubblicità per tutti
          </Text>
        </View>

        {/* Emotional Message */}
        <View style={styles.messageCard}>
          <Ionicons name="cafe-outline" size={28} color={colors.accent} />
          <Text style={styles.messageText}>
            Con solo <Text style={styles.highlight}>1€ al mese</Text> (meno di un caffè!), 
            ci aiuti a mantenere l'app gratuita, sicura e senza pubblicità.
          </Text>
          <Text style={styles.messageSubtext}>
            Il tuo contributo finanzia i server e lo sviluppo di nuove funzioni per il quartiere.
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsSection}>
          <Text style={styles.sectionTitle}>Come Sostenitore ricevi:</Text>
          
          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="heart" size={24} color="#ffd700" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Badge Cuore Dorato</Text>
              <Text style={styles.benefitDesc}>Visibile accanto al tuo nome in tutta l'app</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="sparkles" size={24} color="#ffd700" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Profilo Speciale</Text>
              <Text style={styles.benefitDesc}>Bordo dorato sulla tua foto profilo</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="map" size={24} color="#ffd700" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Visibilità sulla Mappa</Text>
              <Text style={styles.benefitDesc}>Il tuo profilo brillerà tra gli altri</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="ribbon" size={24} color="#ffd700" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Riconoscimento Eterno</Text>
              <Text style={styles.benefitDesc}>Sarai ricordato come fondatore della community</Text>
            </View>
          </View>
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <Text style={styles.planName}>Piano Sostenitore</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>1€</Text>
            <Text style={styles.priceInterval}>/mese</Text>
          </View>
          <Text style={styles.priceHint}>Cancellabile in qualsiasi momento</Text>
        </View>

        {/* Action Button */}
        {isSupporter ? (
          <View style={styles.supporterActive}>
            <View style={styles.supporterBadge}>
              <Ionicons name="heart" size={32} color="#ffd700" />
              <Text style={styles.supporterActiveTitle}>Sei un Sostenitore!</Text>
            </View>
            <Text style={styles.supporterActiveText}>
              Grazie per il tuo supporto alla community.
              {supporterSince && `\nSostenitore dal ${new Date(supporterSince).toLocaleDateString('it-IT')}`}
            </Text>
            <TouchableOpacity 
              style={styles.manageButton}
              onPress={handleManageSubscription}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
              <Text style={styles.manageButtonText}>Gestisci Abbonamento</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.subscribeButton, loading && styles.buttonDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
            data-testid="subscribe-button"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#1a1a2e" />
            ) : (
              <>
                <Ionicons name="heart" size={24} color="#1a1a2e" />
                <Text style={styles.subscribeButtonText}>Sostieni Ora - 1€/mese</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Transparency Note */}
        <View style={styles.transparencyNote}>
          <Ionicons name="shield-checkmark" size={20} color="#4ecca3" />
          <Text style={styles.transparencyText}>
            Pagamento sicuro con Stripe. Puoi disdire quando vuoi dal portale di gestione.
          </Text>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Ionicons name="eye-off" size={16} color="#888" />
          <Text style={styles.privacyText}>
            Il tuo contributo è privato: gli altri vedranno solo che sei un Sostenitore, non l'importo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  heartIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ffd70020',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  messageCard: {
    backgroundColor: '#16213e',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  messageText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
  },
  highlight: {
    color: colors.accent,
    fontWeight: '700',
  },
  messageSubtext: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  benefitsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    gap: 14,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffd70015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 13,
    color: '#888',
  },
  pricingCard: {
    backgroundColor: '#ffd70015',
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffd700',
  },
  planName: {
    fontSize: 14,
    color: '#ffd700',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  priceInterval: {
    fontSize: 18,
    color: '#888',
    marginLeft: 4,
  },
  priceHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffd700',
    marginHorizontal: 20,
    marginTop: 24,
    padding: 18,
    borderRadius: 14,
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  supporterActive: {
    backgroundColor: '#ffd70015',
    marginHorizontal: 20,
    marginTop: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  supporterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  supporterActiveTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffd700',
  },
  supporterActiveText: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  manageButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  transparencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 14,
    backgroundColor: '#4ecca315',
    borderRadius: 10,
  },
  transparencyText: {
    flex: 1,
    fontSize: 12,
    color: '#4ecca3',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 30,
    paddingHorizontal: 14,
  },
  privacyText: {
    flex: 1,
    fontSize: 11,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
});
