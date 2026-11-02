import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';
import { logger } from '../utils/logger';
import { notify } from '../utils/notify';
import { tt } from '../i18n/tt';

interface BlockedUser {
  user_id: string;
  name: string;
}

interface BlockedUsersSectionProps {
  token: string | null;
}

/** Elenco degli utenti bloccati, con il pulsante per sbloccarli (Impostazioni). */
export const BlockedUsersSection: React.FC<BlockedUsersSectionProps> = ({ token }) => {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setLoading(true);
      api.getBlockedUsers(token)
        .then((data) => setUsers(data.blocked_users))
        .catch((err) => logger.debug('Error loading blocked users:', err))
        .finally(() => setLoading(false));
    }, [token])
  );

  const handleUnblock = async (user: BlockedUser) => {
    if (!token || busyId) return;
    setBusyId(user.user_id);
    try {
      await api.unblockUser(user.user_id, token);
      setUsers((current) => current.filter((u) => u.user_id !== user.user_id));
      notify(tt('Utente sbloccato'), user.name);
    } catch (err) {
      logger.debug('Error unblocking user:', err);
      notify(tt('Errore'), tt('Impossibile sbloccare l\'utente'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section} data-testid="blocked-users-section">
      <Text style={styles.title}>{tt('Utenti bloccati')}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : users.length === 0 ? (
        <Text style={styles.empty}>{tt('Nessun utente bloccato')}</Text>
      ) : (
        users.map((user) => (
          <View key={user.user_id} style={styles.row}>
            <Ionicons name="ban-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
            <TouchableOpacity
              style={styles.unblockButton}
              onPress={() => handleUnblock(user)}
              disabled={busyId === user.user_id}
              accessibilityRole="button"
              accessibilityLabel={`${tt('Sblocca')} ${user.name}`}
            >
              <Text style={styles.unblockText}>{tt('Sblocca')}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  loader: { paddingVertical: 12 },
  empty: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  unblockText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});
