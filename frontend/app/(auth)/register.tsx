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
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import RegistrationOnboarding from '../../src/components/RegistrationOnboarding';
import colors from '../../src/theme/colors';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [verificationStep, setVerificationStep] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [resending, setResending] = useState(false);
  const { register, loginWithToken } = useAuth();
  const router = useRouter();

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Errore', 'Compila tutti i campi');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Errore', 'Le password non corrispondono');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Errore', 'Inserisci un indirizzo email valido');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register(email, password, name, referralCode || undefined);
      if (result.requiresVerification && result.userId) {
        setUserId(result.userId);
        setVerificationStep(true);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Registrazione fallita');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6 || !userId) {
      Alert.alert('Errore', 'Inserisci il codice a 6 cifre');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.verifyEmailCode(userId, verificationCode);
      if (response.token && response.user) {
        await loginWithToken(response.token, response.user);
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Codice non valido');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!userId) return;
    setResending(true);
    try {
      await api.resendVerificationCode(userId);
      Alert.alert('Fatto', 'Nuovo codice inviato alla tua email');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile reinviare il codice');
    } finally {
      setResending(false);
    }
  };

  // Show onboarding slides first
  if (showOnboarding) {
    return <RegistrationOnboarding onComplete={handleOnboardingComplete} />;
  }

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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="hand-left" size={40} color="#4ecca3" style={styles.handLeft} />
              <Ionicons name="hand-right" size={40} color="#4ecca3" style={styles.handRight} />
            </View>
            <Text style={styles.title}>Crea Account</Text>
            <Text style={styles.subtitle}>Unisciti alla community</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nome"
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#888"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Conferma Password"
                placeholderTextColor="#888"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="gift-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Codice Referral (opzionale)"
                placeholderTextColor="#888"
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
                maxLength={8}
              />
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.registerButtonText}>Registrati</Text>
              )}
            </TouchableOpacity>

            <View style={styles.bonusContainer}>
              <Text style={styles.bonusIcon}>💎</Text>
              <Text style={styles.bonusText}>Riceverai 3 Granelli di benvenuto!</Text>
            </View>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Hai già un account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.loginLink}>Accedi</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  registerButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  bonusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  bonusIcon: {
    fontSize: 24,
  },
  bonusText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginText: {
    color: '#888',
    fontSize: 14,
  },
  loginLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handLeft: {
    transform: [{ rotate: '45deg' }],
    marginRight: -8,
  },
  handRight: {
    transform: [{ rotate: '-45deg' }, { scaleX: -1 }],
    marginLeft: -8,
  },
  // Verification styles
  verifyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailHighlight: {
    color: colors.accent,
    fontWeight: '600',
  },
  codeInputContainer: {
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    height: 70,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 12,
    paddingHorizontal: 20,
  },
  resendButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  resendText: {
    color: '#888',
    fontSize: 14,
  },
  resendLink: {
    color: colors.accent,
    fontWeight: '600',
  },
});
