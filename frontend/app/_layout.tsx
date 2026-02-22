import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LegalConsentModal from '../src/components/LegalConsentModal';
import { OfflineNotice } from '../src/components/OfflineNotice';

function RootLayoutNav() {
  const { showLegalModal, acceptLegal, user } = useAuth();

  return (
    <>
      <StatusBar style="light" />
      {/* Global Offline Notice */}
      <OfflineNotice />
      
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F1A14' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="favor/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat/[favorId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
      </Stack>
      
      {/* Legal Consent Modal - shows after login/register if not accepted */}
      {user && (
        <LegalConsentModal
          visible={showLegalModal}
          onAccept={acceptLegal}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
