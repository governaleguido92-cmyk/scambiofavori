import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import colors from '../src/theme/colors';
import { notify } from '../src/utils/notify';
import { tt } from '../src/i18n/tt';
import { BrandLogo } from '../src/components/BrandLogo';
import { goBackOrHome } from '../src/utils/navigation';
import { HOME_ROUTE } from '../src/utils/afterRegistration';
import { Linking } from 'react-native';
import { buildPhoneNumber, DEFAULT_PHONE_PREFIX, PHONE_PREFIXES, PhonePrefix } from '../src/utils/phonePrefixes';

const MIN_NATIONAL_DIGITS = 6;

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

type Step = 'phone' | 'code';

/** Verifica del telefono: il numero, poi il codice di 6 cifre ricevuto via SMS (richiesto alla registrazione). */
export default function VerifyPhoneScreen() {
  const { token, user, refreshUser } = useAuth();
  const router = useRouter();
  // Dalla registrazione: ultimo passo prima di entrare, con una spiegazione sulla sicurezza
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isRegistration = from === 'register';
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [prefix, setPrefix] = useState<PhonePrefix>(DEFAULT_PHONE_PREFIX);
  const [pickerOpen, setPickerOpen] = useState(false);
  const phoneReady = phone.replace(/\D/g, '').length >= MIN_NATIONAL_DIGITS;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const goBack = () => (isRegistration ? router.replace(HOME_ROUTE as never) : goBackOrHome(router));

  const sendCode = async () => {
    if (!token || busy || !phoneReady) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestPhoneCode(buildPhoneNumber(prefix, phone), token);
      setStep('code');
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tt('Non riesco a inviare il codice. Riprova.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (typedCode: string = code) => {
    if (!token || busy || typedCode.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyPhoneCode(typedCode, buildPhoneNumber(prefix, phone), token);
      await refreshUser();
      notify(
        tt('Telefono verificato'),
        isRegistration ? tt('Benvenuto! Ora puoi aiutare e chiedere favori.') : tt('Ora puoi pubblicare e accettare favori.')
      );
      goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tt('Codice non valido'));
    } finally {
      setBusy(false);
    }
  };

  if (user?.phone_verified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.column}>
          <View style={styles.centerBox}>
            <Ionicons name="shield-checkmark" size={64} color={colors.lime} />
            <Text style={styles.title}>{tt('Telefono verificato')}</Text>
            <Text style={styles.text}>{tt('Non devi fare altro.')}</Text>
            <TouchableOpacity style={styles.primary} onPress={goBack} accessibilityRole="button">
              <Text style={styles.primaryText}>{tt('Indietro')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <View style={styles.topBar}>
              {isRegistration && step === 'phone' ? <View style={styles.back} /> : (
              <TouchableOpacity
                onPress={step === 'code' ? () => { setStep('phone'); setError(null); } : goBack}
                accessibilityRole="button"
                accessibilityLabel={tt('Indietro')}
                style={styles.back}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              )}
              <BrandLogo />
            </View>

            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name={step === 'phone' ? 'call' : 'chatbubble-ellipses'} size={36} color={colors.lime} />
              </View>
              <Text style={styles.title}>
                {step === 'phone'
                  ? isRegistration ? tt('Un ultimo passo per la sicurezza di tutti') : tt('Verifica il tuo telefono')
                  : tt('Inserisci il codice')}
              </Text>
              <Text style={styles.text}>
                {step === 'phone'
                  ? isRegistration
                    ? tt('Verifichiamo il tuo numero con un SMS per tenere fuori account falsi e truffatori. Non lo conserviamo e gli altri non lo vedono: vedono solo il segno "Telefono verificato".')
                    : tt('Ti mandiamo un SMS con un codice per confermare il tuo numero. Resta privato: gli altri vedono solo il segno "Telefono verificato".')
                  : tt('Ti abbiamo mandato un SMS con un codice di 6 cifre. Vale 10 minuti.')}
              </Text>
            </View>

            {step === 'phone' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{tt('Numero di telefono')}</Text>
                <View style={styles.inputRow}>
                  <TouchableOpacity
                    style={styles.prefixButton}
                    onPress={() => setPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tt('Prefisso')} ${prefix.name} ${prefix.dial}`}
                  >
                    <Text style={styles.prefixText}>{prefix.flag} {prefix.dial}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={(value) => setPhone(value.replace(/[^\d\s]/g, ''))}
                    placeholder="345 000 0000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    maxLength={20}
                    accessibilityLabel={tt('Numero di telefono')}
                  />
                </View>
                <Text style={styles.privacyNote}>
                  {tt('Inviando il numero accetti che lo usiamo come spiegato nella')}{' '}
                  <Text
                    style={styles.privacyLink}
                    onPress={() => router.push('/legal' as never)}
                    accessibilityRole="link"
                    data-testid="privacy-link"
                  >
                    {tt('Privacy Policy')}
                  </Text>
                  .
                </Text>
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.primary, (busy || !phoneReady) && styles.disabled]}
                  onPress={sendCode}
                  disabled={busy || !phoneReady}
                  accessibilityRole="button"
                >
                  {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>{tt('Invia il codice')}</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>{tt('Codice di verifica')}</Text>
                <TextInput
                  style={styles.codeInput}
                  value={code}
                  onChangeText={(value) => {
                    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                    setCode(digits);
                    if (digits.length === CODE_LENGTH) confirmCode(digits);
                  }}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={CODE_LENGTH}
                  autoFocus
                  accessibilityLabel={tt('Codice di verifica')}
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.primary, (busy || code.length !== CODE_LENGTH) && styles.disabled]}
                  onPress={() => confirmCode()}
                  disabled={busy || code.length !== CODE_LENGTH}
                  accessibilityRole="button"
                >
                  {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>{tt('Verifica')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.link}
                  onPress={sendCode}
                  disabled={busy || secondsLeft > 0}
                  accessibilityRole="button"
                >
                  <Text style={[styles.linkText, secondsLeft > 0 && styles.linkDisabled]}>
                    {secondsLeft > 0 ? `${tt('Rinvia il codice tra')} ${secondsLeft} s` : tt('Rinvia il codice')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.link}
                  onPress={() => { setStep('phone'); setCode(''); setError(null); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>{tt('Cambia numero')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.link}
                  onPress={() => Linking.openURL('mailto:infoapp@scambiofavori.it?subject=Non%20ricevo%20il%20codice')}
                  accessibilityRole="link"
                >
                  <Text style={styles.linkDisabled}>{tt('Non arriva il codice? Scrivici')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('Scegli il prefisso')}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel={tt('Chiudi')}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={PHONE_PREFIXES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.prefixRow}
                  onPress={() => { setPrefix(item); setPickerOpen(false); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.prefixRowText}>{item.flag} {item.name}</Text>
                  <Text style={styles.prefixRowDial}>{item.dial}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  header: { alignItems: 'center', marginTop: 8, marginBottom: 24, gap: 12 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  text: { color: colors.textPrimary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  form: { gap: 12 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 17 },
  codeInput: {
    height: 60,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 10,
    textAlign: 'center',
  },
  error: { color: colors.textPrimary, backgroundColor: 'rgba(217, 79, 79, 0.25)', padding: 10, borderRadius: 10, fontSize: 14 },
  primary: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  privacyNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  privacyLink: { color: colors.textPrimary, fontWeight: '600', textDecorationLine: 'underline' },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  linkDisabled: { textDecorationLine: 'none', opacity: 0.7 },
  prefixButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 10, borderRightWidth: 1, borderRightColor: colors.border, height: 32 },
  prefixText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { maxHeight: '70%', backgroundColor: colors.backgroundCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
  prefixRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  prefixRowText: { color: colors.textPrimary, fontSize: 16 },
  prefixRowDial: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  centerBox: { alignItems: 'center', gap: 14, paddingTop: 48 },
});
