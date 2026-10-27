import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'token';

// SecureStore (Keychain/Keystore) is unavailable on web: fall back to AsyncStorage there.
const useSecureStore = Platform.OS !== 'web';

export async function getStoredToken(): Promise<string | null> {
  if (!useSecureStore) {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (secureToken) {
    return secureToken;
  }
  // One-time migration of tokens saved in plain AsyncStorage by older app versions.
  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  return legacyToken;
}

export async function setStoredToken(token: string): Promise<void> {
  if (!useSecureStore) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}
