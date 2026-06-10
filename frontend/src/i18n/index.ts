import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import it from './translations/it';
import en from './translations/en';

const LANGUAGE_KEY = 'app_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(code: string) {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  } catch {}
}

export async function initI18n() {
  const stored = await getStoredLanguage();
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'it';
  const lng = stored || (deviceLocale === 'en' ? 'en' : 'it');

  await i18n.use(initReactI18next).init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    lng,
    fallbackLng: 'it',
    interpolation: { escapeValue: false },
  });
}

export async function changeLanguage(code: string) {
  await i18n.changeLanguage(code);
  await setStoredLanguage(code);
}

export default i18n;
