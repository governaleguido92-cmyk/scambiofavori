import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api, Badge } from '../services/api';
import colors from '../theme/colors';
import { tt } from '../i18n/tt';
import { badgeIconName } from './profile/BadgeShelf';

const REFRESH_MS = 45000;
const storageKey = (userId: string) => `seen_badges_${userId}`;

/**
 * Un momento di festa quando ottieni un badge nuovo. La prima volta (nessun elenco salvato) si memorizzano i badge che hai già,
 * senza festeggiarli. L'elenco dell'utente si aggiorna da solo ogni 45 secondi, così il badge compare poco dopo il favore.
 */
export function BadgeCelebration() {
  const { user, refreshUser } = useAuth();
  const [queue, setQueue] = useState<Badge[]>([]);
  const checking = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => { refreshUser().catch(() => undefined); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshUser]);

  const owned = user?.badges?.join(',') ?? '';
  useEffect(() => {
    if (!user || checking.current) return;
    checking.current = true;
    (async () => {
      try {
        const key = storageKey(user.user_id);
        const stored = await AsyncStorage.getItem(key);
        const current = user.badges ?? [];
        if (stored === null) {
          await AsyncStorage.setItem(key, JSON.stringify(current));
          return;
        }
        const seen: string[] = JSON.parse(stored);
        const fresh = current.filter((id) => !seen.includes(id));
        if (fresh.length === 0) return;
        const definitions = await api.getAllBadges();
        // Si segna come "visto" solo dopo aver ottenuto le definizioni: se la richiesta fallisce la festa si rifà al prossimo giro
        await AsyncStorage.setItem(key, JSON.stringify(current));
        setQueue((previous) => [...previous, ...definitions.filter((badge) => fresh.includes(badge.id))]);
      } catch {
        // La festa è un extra: se qualcosa va storto si riprova al prossimo aggiornamento
      } finally {
        checking.current = false;
      }
    })();
  }, [owned, user?.user_id]);

  const badge = queue[0];
  return (
    <Modal visible={!!badge} transparent animationType="fade" onRequestClose={() => setQueue((q) => q.slice(1))}>
      <View style={styles.overlay}>
        {badge && (
          <View style={styles.card} data-testid="badge-celebration">
            <Text style={styles.kicker}>{tt('Nuovo badge!')}</Text>
            <View style={[styles.icon, { backgroundColor: badge.color }]}>
              <Ionicons name={badgeIconName(badge.icon) as any} size={56} color={colors.background} />
            </View>
            <Text style={styles.name}>{tt(badge.name)}</Text>
            <Text style={styles.description}>{tt(badge.description)}</Text>
            <TouchableOpacity style={styles.button} onPress={() => setQueue((q) => q.slice(1))} accessibilityRole="button">
              <Text style={styles.buttonText}>{queue.length > 1 ? tt('Avanti') : tt('Che bello!')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.backgroundCard, borderRadius: 24, padding: 24, alignItems: 'center', width: '100%', maxWidth: 360, gap: 12 },
  kicker: { color: colors.accent, fontSize: 14, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  icon: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  button: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 999, marginTop: 8 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '800' },
});
