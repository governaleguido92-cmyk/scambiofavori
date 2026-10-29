import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../src/context/AuthContext';
import { SUPPORTED_LANGUAGES, changeLanguage } from '../src/i18n';
import { api } from '../src/services/api';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';
import themeColors from '../src/theme/colors';
import { styles } from '../src/styles/profile.styles';
import { logger } from '../src/utils/logger';
import { notify } from '../src/utils/notify';
import { tt } from '../src/i18n/tt';

const NOTIFICATION_OPTIONS = [
  { key: 'favor_accepted', label: 'Favore accettato', icon: 'checkmark-circle', desc: 'Quando qualcuno accetta il tuo favore' },
  { key: 'favor_completed', label: 'Favore completato', icon: 'trophy', desc: 'Al completamento di un favore' },
  { key: 'new_message', label: 'Nuovi messaggi', icon: 'chatbubble', desc: 'Messaggi nella chat' },
  { key: 'new_review', label: 'Nuove recensioni', icon: 'star', desc: 'Quando ricevi una recensione' },
  { key: 'skill_match', label: 'Match competenze', icon: 'flash', desc: 'Favori che corrispondono alle tue competenze' },
] as const;

export default function SettingsScreen() {
  const { user, token, logout, deleteAccount } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    favor_accepted: true, favor_completed: true, new_message: true, new_review: true, skill_match: true,
  });

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api.getNotificationPreferences(token)
        .then(setNotifPrefs)
        .catch((err) => logger.debug('Error loading notification prefs:', err));
    }, [token])
  );

  const handleLogout = () => {
    Alert.alert(tt('Logout'), tt('Sei sicuro di voler uscire?'), [
      { text: tt('Annulla'), style: 'cancel' },
      { text: tt('Esci'), style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  const handleToggleNotifPref = async (key: string) => {
    if (!token) return;
    const previous = notifPrefs;
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    try {
      await api.updateNotificationPreferences(updated, token);
    } catch (err) {
      setNotifPrefs(previous);
      notify(tt('Errore'), tt('Impossibile aggiornare le preferenze'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { justifyContent: 'flex-start', gap: 12 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tt('Indietro')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{tt('Impostazioni')}</Text>
        </View>

        <View style={styles.section} data-testid="notification-preferences-section">
          <Text style={styles.sectionTitle}>{tt('Preferenze Notifiche')}</Text>
          <View style={styles.notifPrefsContainer}>
            {NOTIFICATION_OPTIONS.map((item) => (
              <View key={item.key} style={styles.notifPrefRow}>
                <View style={styles.notifPrefIcon}>
                  <Ionicons name={item.icon} size={20} color={themeColors.accent} />
                </View>
                <View style={styles.notifPrefText}>
                  <Text style={styles.notifPrefLabel}>{tt(item.label)}</Text>
                  <Text style={styles.notifPrefDesc}>{tt(item.desc)}</Text>
                </View>
                <Switch
                  value={!!notifPrefs[item.key]}
                  onValueChange={() => handleToggleNotifPref(item.key)}
                  trackColor={{ false: themeColors.backgroundLight, true: themeColors.primaryLight }}
                  thumbColor={notifPrefs[item.key] ? themeColors.accent : '#D0DDD3'}
                  data-testid={`notif-toggle-${item.key}`}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.languageSection}>
          <View style={styles.languageLabelRow}>
            <Ionicons name="language" size={20} color="#A8C4B0" />
            <Text style={styles.languageLabel}>{t('settings.language')}</Text>
          </View>
          <View style={styles.languageButtons}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageBtn, i18n.language === lang.code && styles.languageBtnActive]}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text style={styles.languageBtnText}>{lang.flag} {lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#ff6b6b" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        {/* Delete account (GDPR right to erasure; required by Google Play) */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={() => setShowDeleteModal(true)}
          accessibilityRole="button"
          accessibilityLabel={tt('Elimina il mio account')}
        >
          <Text style={styles.deleteAccountText}>{tt('Elimina account')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        email={user?.email ?? ''}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async (confirmEmail) => {
          await deleteAccount(confirmEmail);
          setShowDeleteModal(false);
        }}
      />
    </SafeAreaView>
  );
}
