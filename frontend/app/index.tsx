import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { logger } from '../src/utils/logger';
import { tt } from '../src/i18n/tt';
import { notify } from '../src/utils/notify';

/** Sul web Google rimanda alla stessa scheda con #id_token=... nell'indirizzo. */
function readWebIdToken(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('id_token');
}

export default function Index() {
  const { user, loading, loginWithGoogleToken } = useAuth();
  const router = useRouter();
  const webIdToken = useRef(readWebIdToken()).current;
  const [processingAuth, setProcessingAuth] = useState(Boolean(webIdToken));
  const hasNavigated = useRef(false);
  const webExchangeStarted = useRef(false);

  useEffect(() => {
    const handleDeepLink = async () => {
      if (webIdToken) {
        if (webExchangeStarted.current) return;
        webExchangeStarted.current = true;
        try {
          await loginWithGoogleToken(webIdToken);
        } catch (error) {
          logger.debug('Web session exchange error:', error);
          const reason = error instanceof Error ? error.message : '';
          notify(tt('Errore'), reason ? `${tt('Errore durante il login con Google')}: ${reason}` : tt('Errore durante il login con Google'));
        } finally {
          window.history.replaceState(null, '', window.location.pathname);
          setProcessingAuth(false);
        }
        return;
      }
    };

    handleDeepLink();
  }, []);

  useEffect(() => {
    // Prevent multiple navigations
    if (hasNavigated.current) return;
    
    if (!loading && !processingAuth) {
      hasNavigated.current = true;
      
      // Use setTimeout to ensure navigation happens after render
      setTimeout(() => {
        if (user) {
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/login');
        }
      }, 100);
    }
  }, [user, loading, processingAuth, router]);

  // Reset navigation flag on logout so we redirect to login
  useEffect(() => {
    if (!loading && !user && hasNavigated.current) {
      hasNavigated.current = false;
      router.replace('/(auth)/login');
    }
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#98AA4A" />
      <Text style={styles.loadingText}>{tt('Caricamento...')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0C0E09',
  },
  loadingText: {
    color: '#D4D6CC',
    fontSize: 14,
    marginTop: 16,
  },
});
