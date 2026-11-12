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
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api, EmailUnverifiedError } from '../../src/services/api';
import { logger } from '../../src/utils/logger';
import {
  GOOGLE_NATIVE_CALLBACK,
  buildGoogleAuthUrl,
  isGoogleLoginConfigured,
  readIdTokenFromUrl,
  rememberNonce,
} from '../../src/utils/googleAuth';
import { notify } from '../../src/utils/notify';
import { tt } from '../../src/i18n/tt';
import { hitSlopFor } from '../../src/utils/touch';
import colors from '../../src/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { login, loginWithGoogleToken, loginWithToken } = useAuth();
  const router = useRouter();

  // Check if Apple Sign In is available (iOS only)
  React.useEffect(() => {
    const checkAppleAvailability = async () => {
      if (Platform.OS === 'ios') {
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        setAppleAvailable(isAvailable);
      }
    };
    checkAppleAvailability();
  }, []);

  const handleEmailLogin = async () => {
    if (!email || !password) {
      notify(tt('Errore'), tt('Inserisci email e password'));
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      if (error instanceof EmailUnverifiedError && error.userId) {
        // Email non ancora verificata: si va al passo del codice (il server ne ha appena mandato uno nuovo)
        router.push({ pathname: '/(auth)/register', params: { verify: error.userId } });
        return;
      }
      notify(tt('Errore'), error.message || tt('Login fallito'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isGoogleLoginConfigured()) {
      notify(tt('Errore'), tt('Accesso con Google non ancora attivo'));
      return;
    }
    try {
      setIsLoading(true);
      // Il nonce lo dà il server: lega il token di Google a questa richiesta
      const { nonce, enabled } = await api.getGoogleNonce();
      if (!enabled) {
        notify(tt('Errore'), tt('Accesso con Google non ancora attivo'));
        setIsLoading(false);
        return;
      }
      rememberNonce(nonce);

      // Sul web si accede nella stessa scheda (niente finestra a parte): Google rimanda qui con l'ID token.
      if (Platform.OS === 'web') {
        window.location.assign(buildGoogleAuthUrl(window.location.origin, nonce));
        return;
      }

      // Sul telefono Google ritorna alla pagina del sito, che riapre l'app con il token
      const appUrl = Linking.createURL('/');
      const result = await WebBrowser.openAuthSessionAsync(buildGoogleAuthUrl(GOOGLE_NATIVE_CALLBACK, nonce), appUrl);
      logger.debug('Google Login - Result:', result.type);
      if (result.type === 'success' && result.url) {
        const idToken = readIdTokenFromUrl(result.url);
        if (idToken) {
          await loginWithGoogleToken(idToken);
          router.replace('/(tabs)');
        } else {
          notify(tt('Errore'), tt('Risposta non valida dal server di autenticazione'));
        }
      }
    } catch (error: any) {
      console.error('Google Login Error:', error);
      notify(tt('Errore'), error.message || tt('Errore durante il login con Google'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      logger.debug('Apple Login - Starting...');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      logger.debug('Apple Login - Credential received, user:', credential.user);
      setIsLoading(true);
      
      // Build full name from Apple credential
      let fullName: string | undefined;
      if (credential.fullName) {
        const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean);
        fullName = parts.length > 0 ? parts.join(' ') : undefined;
      }
      
      logger.debug('Apple Login - Sending to backend...');
      // Send to backend
      const response = await api.appleAuth(
        credential.identityToken!,
        credential.user,
        credential.email || undefined,
        fullName
      );
      
      logger.debug('Apple Login - Backend response received');
      // Use login with the received token directly
      if (!response.token || !response.user) throw new Error('Invalid Apple auth response');
      await loginWithToken(response.token, response.user);
      router.replace('/(tabs)');
      
    } catch (error: any) {
      console.error('Apple Login Error:', error);
      if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
        // User cancelled - don't show error
        logger.debug('Apple Login - Cancelled by user');
        return;
      }
      notify(tt('Errore'), error.message || tt('Errore durante il login con Apple'));
    } finally {
      setIsLoading(false);
    }
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
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>{tt('Scambio Favori')}</Text>
            <Text style={styles.subtitle}>{tt('Accedi al tuo account')}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={tt('Email')}
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={tt('Password')}
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={hitSlopFor(20)} accessibilityRole="button" accessibilityLabel={showPassword ? tt('Nascondi la password') : tt('Mostra la password')}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleEmailLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.loginButtonText}>{tt('Accedi')}</Text>
              )}
            </TouchableOpacity>

            <Link href="/(auth)/recovery" asChild>
              <TouchableOpacity style={styles.forgotContainer} data-testid="forgot-link">
                <Text style={styles.forgotText}>{tt('Hai dimenticato la password o il nome utente?')}</Text>
              </TouchableOpacity>
            </Link>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{tt('oppure')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              data-testid="google-login-button"
            >
              <Ionicons name="logo-google" size={20} color={colors.white} />
              <Text style={styles.googleButtonText}>{tt('Continua con Google')}</Text>
            </TouchableOpacity>

            {/* Apple Sign In - Native per iOS, placeholder per altre piattaforme */}
            {Platform.OS === 'ios' && appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleNativeButton}
                onPress={handleAppleLogin}
              />
            ) : (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={() => notify(tt('Disponibile su iOS'), tt('Accedi con Apple è disponibile solo su dispositivi iOS.'))}
                disabled={isLoading}
                data-testid="apple-login-button"
              >
                <Ionicons name="logo-apple" size={20} color={colors.white} />
                <Text style={styles.appleButtonText}>{tt('Continua con Apple')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>{tt('Non hai un account?')}{' '}</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text style={styles.registerLink}>{tt('Registrati')}</Text>
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
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.white,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
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
    color: colors.white,
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    color: colors.textMuted,
    paddingHorizontal: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285f4',
    borderRadius: 12,
    height: 56,
    gap: 12,
  },
  googleButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 12,
    height: 56,
    gap: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  appleButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  appleNativeButton: {
    width: '100%',
    height: 56,
    marginTop: 12,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  registerLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  forgotContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  forgotText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoImage: {
    width: 100,
    height: 100,
  },
});
