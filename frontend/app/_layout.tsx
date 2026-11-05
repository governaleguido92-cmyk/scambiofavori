import React, { useEffect, useState } from 'react';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LegalConsentModal from '../src/components/LegalConsentModal';
import OnboardingSlides from '../src/components/OnboardingSlides';
import { OfflineNotice } from '../src/components/OfflineNotice';
import { ToastHost } from '../src/components/ToastHost';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { MessagesProvider } from '../src/context/MessagesContext';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { initI18n } from '../src/i18n';
import i18n from '../src/i18n';
import { installWebAlert } from '../src/utils/webAlert';

installWebAlert();

function RootLayoutNav() {
  const { showLegalModal, acceptLegal, showOnboarding, completeOnboarding, user, token } = useAuth();
  // useSuspense off: i18n is initialised in the effect below, so it is not ready on first render.
  const { i18n: i18nInstance } = useTranslation(undefined, { useSuspense: false });
  const [i18nReady, setI18nReady] = useState(false);
  // Subito dopo l'iscrizione il telefono si verifica per primo: termini e slide aspettano la fine di quel passo
  const pathname = usePathname();
  const { from } = useGlobalSearchParams<{ from?: string }>();
  const inRegistrationPhoneStep = pathname === '/verify-phone' && from === 'register';

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  // Register for push notifications when authenticated
  usePushNotifications(token);

  if (!i18nReady) return null;

  return (
    <MessagesProvider token={token}>
      <StatusBar style="light" />
      {/* Global Offline Notice */}
      <OfflineNotice />
      {/* Non-blocking messages (replaces simple Alert.alert) */}
      <ToastHost />
      
      <Stack
        key={i18nInstance.language}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0C0E09' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="verify-phone" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card' }} />
        <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="supporter" options={{ presentation: 'modal' }} />
      </Stack>
      
      {/* Legal Consent Modal - shows after login/register if not accepted */}
      {user && (
        <LegalConsentModal
          visible={showLegalModal && !inRegistrationPhoneStep}
          onAccept={acceptLegal}
        />
      )}
      
      {/* Onboarding Slides - shows after accepting legal terms for new users */}
      {user && (
        <OnboardingSlides
          visible={showOnboarding && !inRegistrationPhoneStep}
          onComplete={completeOnboarding}
        />
      )}
    </MessagesProvider>
  );
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
