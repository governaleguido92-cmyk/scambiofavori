import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import colors from '../../src/theme/colors';

type RecoveryMode = 'choose' | 'password' | 'username';
type PasswordStep = 'email' | 'code' | 'done';
type UsernameStep = 'email' | 'code' | 'result';

export default function RecoveryScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<RecoveryMode>('choose');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password recovery state
  const [pwStep, setPwStep] = useState<PasswordStep>('email');
  const [pwCode, setPwCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Username recovery state
  const [unStep, setUnStep] = useState<UsernameStep>('email');
  const [unCode, setUnCode] = useState('');
  const [recoveredUsername, setRecoveredUsername] = useState('');

  const handleForgotPassword = async () => {
    if (!email) { Alert.alert('Errore', 'Inserisci la tua email'); return; }
    setIsLoading(true);
    try {
      await api.forgotPassword(email);
      Alert.alert('Codice inviato', 'Controlla la tua email per il codice di reset');
      setPwStep('code');
    } catch (e: any) {
      Alert.alert('Errore', e.message || 'Errore');
    } finally { setIsLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!pwCode || pwCode.length !== 6) { Alert.alert('Errore', 'Inserisci il codice a 6 cifre'); return; }
    if (!newPassword || newPassword.length < 6) { Alert.alert('Errore', 'La password deve avere almeno 6 caratteri'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Errore', 'Le password non corrispondono'); return; }
    setIsLoading(true);
    try {
      await api.resetPassword(email, pwCode, newPassword);
      setPwStep('done');
    } catch (e: any) {
      Alert.alert('Errore', e.message || 'Codice non valido');
    } finally { setIsLoading(false); }
  };

  const handleRecoverUsername = async () => {
    if (!email) { Alert.alert('Errore', 'Inserisci la tua email'); return; }
    setIsLoading(true);
    try {
      await api.recoverUsername(email);
      Alert.alert('Codice inviato', 'Controlla la tua email per il codice di verifica');
      setUnStep('code');
    } catch (e: any) {
      Alert.alert('Errore', e.message || 'Errore');
    } finally { setIsLoading(false); }
  };

  const handleVerifyUsername = async () => {
    if (!unCode || unCode.length !== 6) { Alert.alert('Errore', 'Inserisci il codice a 6 cifre'); return; }
    setIsLoading(true);
    try {
      const result = await api.verifyUsernameRecovery(email, unCode);
      setRecoveredUsername(result.username);
      setUnStep('result');
    } catch (e: any) {
      Alert.alert('Errore', e.message || 'Codice non valido');
    } finally { setIsLoading(false); }
  };

  const renderChoose = () => (
    <>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="help-circle" size={40} color={colors.accent} />
        </View>
        <Text style={styles.title}>Hai bisogno di aiuto?</Text>
        <Text style={styles.subtitle}>Scegli cosa vuoi recuperare</Text>
      </View>
      <View style={styles.form}>
        <TouchableOpacity style={styles.optionCard} onPress={() => setMode('password')} data-testid="recover-password-option">
          <View style={styles.optionIcon}>
            <Ionicons name="lock-open" size={24} color={colors.accent} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Reset Password</Text>
            <Text style={styles.optionDesc}>Ricevi un codice via email per impostare una nuova password</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionCard} onPress={() => setMode('username')} data-testid="recover-username-option">
          <View style={styles.optionIcon}>
            <Ionicons name="person" size={24} color={colors.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Recupera Nome Utente</Text>
            <Text style={styles.optionDesc}>Ricevi il tuo nome utente associato all'email</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </>
  );

  const renderPasswordFlow = () => {
    if (pwStep === 'done') {
      return (
        <>
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.primaryLight} />
            </View>
            <Text style={styles.title}>Password Aggiornata!</Text>
            <Text style={styles.subtitle}>Ora puoi accedere con la nuova password</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(auth)/login')} data-testid="back-to-login-btn">
            <Text style={styles.primaryButtonText}>Torna al Login</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-open" size={36} color={colors.accent} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {pwStep === 'email' ? 'Inserisci la tua email per ricevere il codice' : 'Inserisci il codice e la nuova password'}
          </Text>
        </View>
        <View style={styles.form}>
          {pwStep === 'email' ? (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" data-testid="recovery-email-input" />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={handleForgotPassword} disabled={isLoading} data-testid="send-reset-code-btn">
                {isLoading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Invia Codice</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.codeInputWrapper}>
                <TextInput style={styles.codeInput} placeholder="000000" placeholderTextColor={colors.textMuted} value={pwCode} onChangeText={setPwCode} keyboardType="number-pad" maxLength={6} textAlign="center" data-testid="reset-code-input" />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Nuova password" placeholderTextColor={colors.textMuted} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPassword} data-testid="new-password-input" />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Conferma password" placeholderTextColor={colors.textMuted} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} data-testid="confirm-password-input" />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={handleResetPassword} disabled={isLoading} data-testid="reset-password-btn">
                {isLoading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Cambia Password</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleForgotPassword} disabled={isLoading} style={styles.resendLink}>
                <Text style={styles.resendText}>Non hai ricevuto il codice? <Text style={styles.resendBold}>Reinvia</Text></Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </>
    );
  };

  const renderUsernameFlow = () => {
    if (unStep === 'result') {
      return (
        <>
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="person-circle" size={40} color={colors.primaryLight} />
            </View>
            <Text style={styles.title}>Nome Utente Trovato</Text>
            <View style={styles.usernameBox}>
              <Text style={styles.usernameLabel}>Il tuo nome utente è:</Text>
              <Text style={styles.usernameValue}>{recoveredUsername}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(auth)/login')} data-testid="back-to-login-btn">
            <Text style={styles.primaryButtonText}>Torna al Login</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="person" size={36} color={colors.primaryLight} />
          </View>
          <Text style={styles.title}>Recupera Nome Utente</Text>
          <Text style={styles.subtitle}>
            {unStep === 'email' ? 'Inserisci la tua email per ricevere il codice' : 'Inserisci il codice ricevuto via email'}
          </Text>
        </View>
        <View style={styles.form}>
          {unStep === 'email' ? (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" data-testid="username-email-input" />
              </View>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleRecoverUsername} disabled={isLoading} data-testid="send-username-code-btn">
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Invia Codice</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.codeInputWrapper}>
                <TextInput style={styles.codeInput} placeholder="000000" placeholderTextColor={colors.textMuted} value={unCode} onChangeText={setUnCode} keyboardType="number-pad" maxLength={6} textAlign="center" data-testid="username-code-input" />
              </View>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleVerifyUsername} disabled={isLoading} data-testid="verify-username-btn">
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verifica</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRecoverUsername} disabled={isLoading} style={styles.resendLink}>
                <Text style={styles.resendText}>Non hai ricevuto il codice? <Text style={styles.resendBold}>Reinvia</Text></Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => {
            if (mode === 'choose') router.back();
            else { setMode('choose'); setPwStep('email'); setUnStep('email'); setPwCode(''); setUnCode(''); setNewPassword(''); setConfirmPassword(''); }
          }} data-testid="recovery-back-btn">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          {mode === 'choose' && renderChoose()}
          {mode === 'password' && renderPasswordFlow()}
          {mode === 'username' && renderUsernameFlow()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  backButton: { position: 'absolute', top: 0, left: 0, zIndex: 10, padding: 4 },
  header: { alignItems: 'center', marginBottom: 32 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentMuted, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  form: { width: '100%' },
  optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundLight, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  optionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentMuted, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  optionText: { flex: 1 },
  optionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  optionDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundLight, borderRadius: 12, paddingHorizontal: 16, marginBottom: 14, height: 52, borderWidth: 1, borderColor: colors.border },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  codeInputWrapper: { marginBottom: 14 },
  codeInput: { backgroundColor: colors.backgroundLight, borderRadius: 12, height: 60, color: colors.granelli, fontSize: 28, fontWeight: 'bold', letterSpacing: 10, borderWidth: 2, borderColor: colors.accent, paddingHorizontal: 16, textAlign: 'center' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: colors.textPrimary, fontSize: 16, fontWeight: 'bold' },
  resendLink: { alignItems: 'center', marginTop: 16 },
  resendText: { color: colors.textMuted, fontSize: 13 },
  resendBold: { color: colors.accent, fontWeight: '600' },
  usernameBox: { backgroundColor: colors.backgroundLight, borderRadius: 12, padding: 20, marginTop: 16, width: '100%', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  usernameLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  usernameValue: { color: colors.granelli, fontSize: 24, fontWeight: 'bold' },
});
