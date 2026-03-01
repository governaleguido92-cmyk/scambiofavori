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
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from '../../src/services/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { login, exchangeSessionId, loginWithToken } = useAuth();
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
      Alert.alert('Errore', 'Inserisci email e password');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Login fallito');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    // Platform-specific redirect URL handling for OAuth
    let redirectUrl: string;
    if (Platform.OS === 'web') {
      // On web, use the current origin for proper OAuth callback
      redirectUrl = window.location.origin;
    } else {
      // On native (iOS/Android), use deep linking
      redirectUrl = Linking.createURL('/');
    }
    
    console.log('Google Login - Platform:', Platform.OS, 'Redirect URL:', redirectUrl);
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    
    try {
      setIsLoading(true);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      console.log('Google Login - Result:', result.type);
      
      if (result.type === 'success' && result.url) {
        // Extract session_id from URL fragment
        const url = result.url;
        console.log('Google Login - Callback URL:', url);
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const fragment = url.substring(hashIndex + 1);
          const params = new URLSearchParams(fragment);
          const sessionId = params.get('session_id');
          
          if (sessionId) {
            console.log('Google Login - Session ID found, exchanging...');
            await exchangeSessionId(sessionId);
            router.replace('/(tabs)');
          } else {
            console.log('Google Login - No session_id in fragment');
            Alert.alert('Errore', 'Sessione non trovata nella risposta');
          }
        } else {
          console.log('Google Login - No hash fragment in URL');
          Alert.alert('Errore', 'Risposta non valida dal server di autenticazione');
        }
      } else if (result.type === 'cancel') {
        console.log('Google Login - Cancelled by user');
      } else {
        console.log('Google Login - Unexpected result type:', result.type);
      }
    } catch (error: any) {
      console.error('Google Login Error:', error);
      Alert.alert('Errore', error.message || 'Errore durante il login con Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      console.log('Apple Login - Starting...');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      console.log('Apple Login - Credential received, user:', credential.user);
      setIsLoading(true);
      
      // Build full name from Apple credential
      let fullName: string | undefined;
      if (credential.fullName) {
        const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean);
        fullName = parts.length > 0 ? parts.join(' ') : undefined;
      }
      
      console.log('Apple Login - Sending to backend...');
      // Send to backend
      const response = await api.appleAuth(
        credential.identityToken!,
        credential.user,
        credential.email || undefined,
        fullName
      );
      
      console.log('Apple Login - Backend response received');
      // Use login with the received token directly
      await loginWithToken(response.token, response.user);
      router.replace('/(tabs)');
      
    } catch (error: any) {
      console.error('Apple Login Error:', error);
      if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
        // User cancelled - don't show error
        console.log('Apple Login - Cancelled by user');
        return;
      }
      Alert.alert('Errore', error.message || 'Errore durante il login con Apple');
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
              <Ionicons name="hand-left" size={40} color="#4ecca3" style={styles.handLeft} />
              <Ionicons name="hand-right" size={40} color="#4ecca3" style={styles.handRight} />
            </View>
            <Text style={styles.title}>Scambio di Favori</Text>
            <Text style={styles.subtitle}>Accedi al tuo account</Text>
          </View>

          <View style={styles.form}>
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

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleEmailLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.loginButtonText}>Accedi</Text>
              )}
            </TouchableOpacity>

            <Link href="/(auth)/recovery" asChild>
              <TouchableOpacity style={styles.forgotContainer} data-testid="forgot-link">
                <Text style={styles.forgotText}>Hai dimenticato la password o il nome utente?</Text>
              </TouchableOpacity>
            </Link>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>oppure</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              data-testid="google-login-button"
            >
              <Ionicons name="logo-google" size={20} color="#fff" />
              <Text style={styles.googleButtonText}>Continua con Google</Text>
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
                onPress={() => Alert.alert('Disponibile su iOS', 'Accedi con Apple è disponibile solo su dispositivi iOS.')}
                disabled={isLoading}
                data-testid="apple-login-button"
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.appleButtonText}>Continua con Apple</Text>
              </TouchableOpacity>
            )}

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Non hai un account? </Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text style={styles.registerLink}>Registrati</Text>
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
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
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
  loginButton: {
    backgroundColor: '#4ecca3',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#1a1a2e',
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
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#888',
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
    color: '#fff',
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
    borderColor: '#333',
  },
  appleButtonText: {
    color: '#fff',
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
    color: '#888',
    fontSize: 14,
  },
  registerLink: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
  },
  forgotContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  forgotText: {
    color: '#E07B39',
    fontSize: 13,
    fontWeight: '500',
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
});
