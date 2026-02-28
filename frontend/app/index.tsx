import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import * as Linking from 'expo-linking';

export default function Index() {
  const { user, loading, exchangeSessionId } = useAuth();
  const router = useRouter();
  const [processingAuth, setProcessingAuth] = useState(false);
  const hasNavigated = useRef(false);

  useEffect(() => {
    const handleDeepLink = async () => {
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
        console.log('Deep link error:', error);
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

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4ecca3" />
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1A14',
  },
  loadingText: {
    color: '#A8C4B0',
    fontSize: 14,
    marginTop: 16,
  },
});
