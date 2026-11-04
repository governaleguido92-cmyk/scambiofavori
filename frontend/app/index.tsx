import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import * as Linking from 'expo-linking';
import { logger } from '../src/utils/logger';
import { tt } from '../src/i18n/tt';
import { notify } from '../src/utils/notify';

/** Sul web Google rimanda alla stessa scheda con #session_id=... nell'indirizzo. */
function readWebSessionId(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('session_id');
}

export default function Index() {
  const { user, loading, exchangeSessionId } = useAuth();
  const router = useRouter();
  const webSessionId = useRef(readWebSessionId()).current;
  const [processingAuth, setProcessingAuth] = useState(Boolean(webSessionId));
  const hasNavigated = useRef(false);
  const webExchangeStarted = useRef(false);

  useEffect(() => {
    const handleDeepLink = async () => {
      if (webSessionId) {
        if (webExchangeStarted.current) return;
        webExchangeStarted.current = true;
        try {
          await exchangeSessionId(webSessionId);
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
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const { queryParams } = Linking.parse(url);
          const sessionId = queryParams?.session_id as string;
          if (sessionId && !processingAuth) {
            setProcessingAuth(true);
            await exchangeSessionId(sessionId);
            setProcessingAuth(false);
          }
        }
      } catch (error) {
        logger.debug('Deep link error:', error);
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
