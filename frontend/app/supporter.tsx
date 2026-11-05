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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import colors from '../src/theme/colors';
import { logger } from '../src/utils/logger';
import { SUPPORTER_PURCHASE_ENABLED } from '../src/utils/features';
import { notify } from '../src/utils/notify';
import { BrandLogo } from '../src/components/BrandLogo';
import { goBackOrHome } from '../src/utils/navigation';

function SupporterContent() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isSupporter, setIsSupporter] = useState(false);
  const [supporterSince, setSupporterSince] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);

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
      setCanCancel(!!status.can_cancel);
      setCancelAtPeriodEnd(!!status.cancel_at_period_end);
      setPeriodEnd(status.period_end);
    } catch (error) {
      logger.debug('Error loading supporter status:', error);
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
        notify('Sessione scaduta', 'La sessione di pagamento è scaduta. Riprova.');
        return;
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      logger.debug('Payment status check error:', error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  };

  const handleSubscribe = async () => {
    if (!token) {
      notify('Accedi', 'Devi effettuare l\'accesso per diventare un Sostenitore');
      return;
    }

    setLoading(true);
    try {
      // On web Stripe must return to this app, not to the API server.
      const originUrl =
        Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!originUrl) {
        notify('Errore', 'Configurazione URL mancante');
        setLoading(false);
        return;
      }
      const result = await api.createSubscriptionCheckout(originUrl, token);
      
      // Open Stripe checkout in browser
      const supported = await Linking.canOpenURL(result.checkout_url);
      if (supported) {
        await Linking.openURL(result.checkout_url);
      } else {
        notify('Errore', 'Impossibile aprire il checkout');
      }
    } catch (error: any) {
      notify('Errore', error.message || 'Errore nella creazione del checkout');
    } finally {
      setLoading(false);
    }
  };

  const formatLongDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const applyPlanChange = async (change: 'cancel' | 'resume') => {
    if (!token) return;
    setChangingPlan(true);
    try {
      const result = change === 'cancel' ? await api.cancelSubscription(token) : await api.resumeSubscription(token);
      setCancelAtPeriodEnd(result.cancel_at_period_end);
      setPeriodEnd(result.period_end);
      const endText = formatLongDate(result.period_end);
      notify(
        change === 'cancel' ? 'Abbonamento disdetto' : 'Abbonamento riattivato',
        change === 'cancel'
          ? `Resti Sostenitore${endText ? ` fino al ${endText}` : ' fino alla fine del periodo pagato'}. Poi non verrà più addebitato nulla.`
          : 'Grazie! L\'abbonamento continuerà a rinnovarsi ogni mese.',
      );
    } catch (error: any) {
      notify('Errore', error.message || 'Non sono riuscito a modificare l\'abbonamento. Riprova.');
    } finally {
      setChangingPlan(false);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Disdire l\'abbonamento?',
      `Resti Sostenitore${periodEnd ? ` fino al ${formatLongDate(periodEnd)}` : ' fino alla fine del periodo già pagato'}. Dopo non ti verrà addebitato più nulla.`,
      [
        { text: 'Non disdire', style: 'cancel' },
        { text: 'Disdici', style: 'destructive', onPress: () => applyPlanChange('cancel') },
      ],
    );
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
      notify('Errore', error.message || 'Errore nel caricamento del portale');
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => goBackOrHome(router)} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <BrandLogo />
          </View>
          <Text style={styles.headerTitle}>Sostieni il Progetto</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heartIcon}>
            <Ionicons name="heart" size={64} color="#98AA4A" />
          </View>
          <Text style={styles.heroTitle}>Diventa un Pilastro{'\n'}della Community</Text>
          <Text style={styles.heroSubtitle}>
            Il tuo supporto mantiene l&apos;app gratuita, sicura e senza pubblicità per tutti
          </Text>
        </View>

        {/* Emotional Message */}
        <View style={styles.messageCard}>
          <Ionicons name="cafe-outline" size={32} color={colors.accent} />
          <Text style={styles.messageText}>
            Con solo <Text style={styles.highlight}>1€ al mese</Text> (meno di un caffè!), 
            ci aiuti a mantenere l&apos;app gratuita, sicura e senza pubblicità.
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
              <Ionicons name="heart" size={24} color="#98AA4A" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Badge Cuore Dorato</Text>
              <Text style={styles.benefitDesc}>Visibile accanto al tuo nome in tutta l&apos;app</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="sparkles" size={24} color="#98AA4A" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Profilo Speciale</Text>
              <Text style={styles.benefitDesc}>Bordo dorato sulla tua foto profilo</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="map" size={24} color="#98AA4A" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Visibilità sulla Mappa</Text>
              <Text style={styles.benefitDesc}>Il tuo profilo brillerà tra gli altri</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.benefitIcon}>
              <Ionicons name="ribbon" size={24} color="#98AA4A" />
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
              <Ionicons name="heart" size={32} color="#98AA4A" />
              <Text style={styles.supporterActiveTitle}>Sei un Sostenitore!</Text>
            </View>
            <Text style={styles.supporterActiveText}>
              Grazie per il tuo supporto alla community.
              {supporterSince && `\nSostenitore dal ${new Date(supporterSince).toLocaleDateString('it-IT')}`}
            </Text>
            {canCancel ? (
              <>
                <Text style={styles.planStatus}>
                  {cancelAtPeriodEnd
                    ? `Abbonamento disdetto: resti Sostenitore fino al ${formatLongDate(periodEnd) ?? 'termine del periodo pagato'}. Poi non verrà più addebitato nulla.`
                    : `Si rinnova ${periodEnd ? `il ${formatLongDate(periodEnd)}` : 'ogni mese'}: 1 € al mese, disdicibile quando vuoi.`}
                </Text>
                <TouchableOpacity
                  style={[cancelAtPeriodEnd ? styles.resumeButton : styles.cancelPlanButton, changingPlan && styles.buttonDisabled]}
                  onPress={cancelAtPeriodEnd ? () => applyPlanChange('resume') : handleCancelSubscription}
                  disabled={changingPlan}
                  data-testid={cancelAtPeriodEnd ? 'resume-subscription-button' : 'cancel-subscription-button'}
                >
                  {changingPlan ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={cancelAtPeriodEnd ? 'refresh-outline' : 'close-circle-outline'} size={20} color="#fff" />
                      <Text style={styles.manageButtonText}>{cancelAtPeriodEnd ? 'Riattiva abbonamento' : 'Annulla abbonamento'}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleManageSubscription} style={styles.cardLink}>
                  <Text style={styles.cardLinkText}>Cambia carta o scarica le fatture</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.manageButton}
                  onPress={handleManageSubscription}
                >
                  <Ionicons name="settings-outline" size={20} color="#fff" />
                  <Text style={styles.manageButtonText}>Gestisci Abbonamento</Text>
                </TouchableOpacity>
                <Text style={styles.manageHint}>
                  Puoi disdire quando vuoi: resti Sostenitore fino alla fine del mese già pagato.
                </Text>
              </>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.subscribeButton, loading && styles.buttonDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
            data-testid="subscribe-button"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#0C0E09" />
            ) : (
              <>
                <Ionicons name="heart" size={24} color="#0C0E09" />
                <Text style={styles.subscribeButtonText}>Sostieni Ora - 1€/mese</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Transparency Note */}
        <View style={styles.transparencyNote}>
          <Ionicons name="shield-checkmark" size={20} color="#98AA4A" />
          <Text style={styles.transparencyText}>
            Pagamento sicuro con Stripe. Puoi disdire quando vuoi dal portale di gestione.
          </Text>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Ionicons name="eye-off" size={16} color="#A5A89B" />
          <Text style={styles.privacyText}>
            Il tuo contributo è privato: gli altri vedranno solo che sei un Sostenitore, non l&apos;importo.
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
    fontSize: 16,
    color: '#A5A89B',
    textAlign: 'center',
    lineHeight: 22,
  },
  messageCard: {
    backgroundColor: '#171A10',
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
    fontSize: 14,
    color: '#A5A89B',
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
    backgroundColor: '#171A10',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 14,
    color: '#A5A89B',
  },
  pricingCard: {
    backgroundColor: '#ffd70015',
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#98AA4A',
  },
  planName: {
    fontSize: 14,
    color: '#98AA4A',
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
    color: '#A5A89B',
    marginLeft: 4,
  },
  priceHint: {
    fontSize: 14,
    color: '#A5A89B',
    marginTop: 8,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#98AA4A',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#0C0E09',
  },
  supporterActive: {
    backgroundColor: '#ffd70015',
    marginHorizontal: 20,
    marginTop: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#98AA4A',
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
    color: '#98AA4A',
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
  planStatus: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  cancelPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#B3392B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 220,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5F7A24',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 220,
  },
  cardLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  cardLinkText: {
    color: '#fff',
    opacity: 0.85,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  manageHint: {
    color: '#fff',
    opacity: 0.85,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },
  transparencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 14,
    backgroundColor: '#B8C86815',
    borderRadius: 10,
  },
  transparencyText: {
    flex: 1,
    fontSize: 12,
    color: '#98AA4A',
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
    fontSize: 12,
    color: '#A5A89B',
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
    color: '#A5A89B',
    marginTop: 8,
  },
});

export default function SupporterScreen() {
  // Reachable by deep link even when the entry points are hidden: send Android users home.
  if (!SUPPORTER_PURCHASE_ENABLED) return <Redirect href="/(tabs)" />;
  return <SupporterContent />;
}
