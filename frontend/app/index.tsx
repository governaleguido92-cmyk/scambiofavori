import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import * as Linking from 'expo-linking';

export default function Index() {
  const { user, loading, exchangeSessionId } = useAuth();
  const router = useRouter();
  const [processingAuth, setProcessingAuth] = useState(false);

  useEffect(() => {
    const handleDeepLink = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        const { queryParams } = Linking.parse(url);
        // Check for session_id in fragment or query
        const sessionId = queryParams?.session_id as string;
        if (sessionId && !processingAuth) {
          setProcessingAuth(true);
          await exchangeSessionId(sessionId);
          setProcessingAuth(false);
        }
      }
    };

    handleDeepLink();
  }, []);

  useEffect(() => {
    if (!loading && !processingAuth) {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [user, loading, processingAuth]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4ecca3" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});
