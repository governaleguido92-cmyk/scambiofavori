import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../services/api';
import { logger } from '../utils/logger';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (Platform.OS === 'web') {
    logger.debug('[Push] Skipping push registration on web');
    return null;
  }

  if (!Device.isDevice) {
    logger.debug('[Push] Must use physical device for Push Notifications');
    return null;
  }

  // Android: create notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Scambio di Favori',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2D5A3D',
    });
  }

  // Check permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.debug('[Push] Permission not granted');
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId || '451c9e7f-fa11-4914-a8f0-7ff3d07cde8f',
  });

  return tokenData.data;
}

export function usePushNotifications(authToken: string | null) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  useEffect(() => {
    if (!authToken) return;

    let cancelled = false;

    // Register for push notifications
    registerForPushNotificationsAsync().then(async (token) => {
      if (cancelled || !token) return;
      setExpoPushToken(token);
      try {
        await api.registerPushToken(token, authToken);
        logger.debug('[Push] Token registered:', token.substring(0, 30) + '...');
      } catch (err) {
        logger.debug('[Push] Failed to register token:', err);
      }
    });

    // Listen for notifications received in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      logger.debug('[Push] Received:', notification.request.content.title);
    });

    // Listen for notification interactions (taps)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      logger.debug('[Push] Tapped:', data);
      // Navigation is handled by the app's notification screen
    });

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [authToken]);

  return { expoPushToken };
}
