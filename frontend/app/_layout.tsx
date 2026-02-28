import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LegalConsentModal from '../src/components/LegalConsentModal';
import OnboardingSlides from '../src/components/OnboardingSlides';
import { OfflineNotice } from '../src/components/OfflineNotice';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

function RootLayoutNav() {
  const { showLegalModal, acceptLegal, showOnboarding, completeOnboarding, user, token } = useAuth();
  
  // Register for push notifications when authenticated
  usePushNotifications(token);

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
        <Stack.Screen name="supporter" options={{ presentation: 'modal' }} />
      </Stack>
      
      {/* Legal Consent Modal - shows after login/register if not accepted */}
      {user && (
        <LegalConsentModal
          visible={showLegalModal}
          onAccept={acceptLegal}
        />
      )}
      
      {/* Onboarding Slides - shows after accepting legal terms for new users */}
      {user && (
        <OnboardingSlides
          visible={showOnboarding}
          onComplete={completeOnboarding}
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
