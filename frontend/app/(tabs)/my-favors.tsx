import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import { useTranslation } from 'react-i18next';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';
import colors from '../../src/theme/colors';
import { FavorCard } from '../../src/components/FavorCard';
import { canComplete, groupByTab, isExpired, MyFavorTab, roleOf } from '../../src/utils/myFavors';

const STATUS_COLORS = {
  waiting: '#C9A227',
  expired: '#6B7F72',
  ongoing: '#2F7A4D',
  completed: '#2F8F5B',
  cancelled: '#8A8A8A',
} as const;

const TAB_ORDER: ReadonlyArray<MyFavorTab> = ['ongoing', 'published', 'closed'];

const tabLabel = (tab: MyFavorTab): string =>
  tab === 'ongoing' ? tt('In corso') : tab === 'published' ? tt('Pubblicati') : tt('Conclusi');

/** Etichetta e colore dello stato sulla banda della scheda. */
const statusOf = (favor: Favor): { label: string; color: string } => {
  if (favor.status === 'accepted') return { label: tt('In corso'), color: STATUS_COLORS.ongoing };
  if (favor.status === 'completed') return { label: tt('Concluso'), color: STATUS_COLORS.completed };
  if (favor.status === 'cancelled') return { label: tt('Annullato'), color: STATUS_COLORS.cancelled };
  if (isExpired(favor)) return { label: tt('Scaduto'), color: STATUS_COLORS.expired };
  return { label: tt('In attesa'), color: STATUS_COLORS.waiting };
};

/** La riga che dice chi aiuta chi, al posto del nome dell'autore. */
const roleText = (favor: Favor, userId: string | undefined): string => {
  if (favor.status === 'cancelled') return tt('Favore annullato');
  const { relation, otherName } = roleOf(favor, userId);
  const name = otherName || tt('un vicino');
  const done = favor.status === 'completed';
  if (relation === 'iHelp') return tx(done ? 'Hai aiutato {0}' : 'Stai aiutando {0}', [name]);
  if (relation === 'helpsMe') return tx(done ? '{0} ti ha aiutato' : '{0} ti sta aiutando', [name]);
  return isExpired(favor) ? tt('Nessuno ha accettato in tempo') : tt('In attesa di qualcuno che accetti');
};

interface SummaryProps {
  helped: number;
  received: number;
  balance: number;
}

function SummaryStrip({ helped, received, balance }: SummaryProps) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{helped}</Text>
        <Text style={styles.summaryLabel}>{tt('Hai aiutato')}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{received}</Text>
        <Text style={styles.summaryLabel}>{tt('Hai ricevuto')}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={[styles.summaryValue, styles.summaryGold]}>{CURRENCY_SYMBOL} {balance}</Text>
        <Text style={styles.summaryLabel}>{tt('Il tuo saldo')}</Text>
      </View>
    </View>
  );
}

interface EmptyProps {
  tab: MyFavorTab;
  onCreate: () => void;
  onBrowse: () => void;
}

function EmptyState({ tab, onCreate, onBrowse }: EmptyProps) {
  const text =
    tab === 'ongoing'
      ? tt('Nessun favore in corso')
      : tab === 'published'
      ? tt('Non hai favori pubblicati')
      : tt('Ancora nessun favore concluso');
  const hint =
    tab === 'ongoing'
      ? tt('Quando accetti un favore, o qualcuno accetta il tuo, compare qui.')
      : tab === 'published'
      ? tt('Pubblica una richiesta o un\'offerta: i tuoi vicini la vedranno subito.')
      : tt('I favori finiti restano qui, per ricordare quanto aiuto avete scambiato.');
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={56} color={colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptySubtext}>{hint}</Text>
      {tab === 'published' && (
        <TouchableOpacity style={styles.primaryButton} onPress={onCreate} accessibilityRole="button">
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>{tt('Crea il tuo primo favore')}</Text>
        </TouchableOpacity>
      )}
      {tab === 'ongoing' && (
        <TouchableOpacity style={styles.primaryButton} onPress={onBrowse} accessibilityRole="button">
          <Ionicons name="search" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>{tt('Vedi i favori vicino a te')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function MyFavorsScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chosenTab, setChosenTab] = useState<MyFavorTab | null>(null);

  const loadMyFavors = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getMyFavors(token);
      setFavors(data);
    } catch (error) {
      logger.debug('Error loading my favors:', error);
      notify(t('common.error'), tt('Non riesco ad aggiornare i tuoi favori. Riprova tra poco.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      loadMyFavors();
    }, [loadMyFavors])
  );

  const groups = useMemo(() => groupByTab(favors), [favors]);
  // Finché non scegli una scheda si apre quella che richiede attenzione: i favori in corso, altrimenti i pubblicati.
  const tab: MyFavorTab = chosenTab ?? (groups.ongoing.length > 0 ? 'ongoing' : 'published');
  const visible = groups[tab];

  const onRefresh = () => {
    setRefreshing(true);
    loadMyFavors();
  };

  const handleComplete = (favorId: string) => {
    if (!token) return;
    Alert.alert(
      t('common.confirm'),
      tx('Sei sicuro di voler segnare questo favore come completato? I {0} verranno trasferiti.', [CURRENCY_NAME]),
      [
        { text: tt('Annulla'), style: 'cancel' },
        {
          text: tt('Completa'),
          onPress: async () => {
            try {
              await api.completeFavor(favorId, token);
              await refreshUser();
              loadMyFavors();
              notify(t('common.success'), tx('Favore completato! I {0} sono stati trasferiti.', [CURRENCY_NAME]));
            } catch (error: any) {
              notify(t('common.error'), error.message || t('favor.errorComplete'));
            }
          },
        },
      ]
    );
  };

  const handleCancel = (favorId: string) => {
    if (!token) return;
    Alert.alert(t('common.confirm'), tt('Sei sicuro di voler cancellare questo favore?'), [
      { text: tt('No'), style: 'cancel' },
      {
        text: tt('Sì, cancella'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelFavor(favorId, token);
            loadMyFavors();
          } catch (error: any) {
            notify(t('common.error'), error.message || t('favor.errorAccept'));
          }
        },
      },
    ]);
  };

  // Ripubblicare = aprire "Crea" con i testi già compilati, da rivedere prima di pubblicare.
  const handleRepublish = (favor: Favor) => {
    router.push({
      pathname: '/create',
      params: { title: favor.title, description: favor.description, category: favor.category, type: favor.type },
    } as any);
  };

  const openFavor = (favor: Favor) => router.push(`/favor/${favor.favor_id}`);

  const renderFavor = ({ item }: { item: Favor }) => {
    const status = statusOf(item);
    const isCreator = item.creator_id === user?.user_id;
    const expired = isExpired(item);
    const mayComplete = canComplete(item, user?.user_id);

    return (
      <FavorCard
        item={item}
        currentUserId={user?.user_id}
        onPress={openFavor}
        statusLabel={status.label}
        statusColor={status.color}
        roleText={roleText(item, user?.user_id)}
        style={styles.card}
      >
        {item.status === 'accepted' && (
          <View style={styles.cardActions}>
            <Text style={styles.hint}>
              {mayComplete
                ? tx('A favore finito tocca Completa: i {0} passano a chi ti ha aiutato.', [CURRENCY_NAME])
                : tt('Accordatevi in chat. Il favore lo chiude chi lo riceve.')}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.primaryButton, styles.flexButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push(`/chat/${item.favor_id}` as any);
                }}
                accessibilityRole="button"
                accessibilityLabel={tt('Apri la chat')}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>{tt('Apri la chat')}</Text>
              </TouchableOpacity>
              {mayComplete && (
                <TouchableOpacity
                  style={[styles.secondaryButton, styles.flexButton]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleComplete(item.favor_id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('favor.complete')}
                >
                  <Ionicons name="checkmark-circle" size={18} color={colors.lime} />
                  <Text style={styles.secondaryButtonText}>{t('favor.complete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {item.status === 'active' && isCreator && (
          <View style={styles.cardActions}>
            <View style={styles.buttonRow}>
              {expired && (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexButton]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRepublish(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={tt('Ripubblica')}
                >
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>{tt('Ripubblica')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.secondaryButton, styles.flexButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleCancel(item.favor_id);
                }}
                accessibilityRole="button"
                accessibilityLabel={tt('Annulla il favore')}
              >
                <Ionicons name="close-circle" size={18} color={colors.error} />
                <Text style={[styles.secondaryButtonText, styles.dangerText]}>{tt('Annulla il favore')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </FavorCard>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('tabs.myFavors')}</Text>
      </View>

      <SummaryStrip
        helped={user?.total_favors_given ?? 0}
        received={user?.total_favors_received ?? 0}
        balance={user?.granelli ?? 0}
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        {TAB_ORDER.map((key) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setChosenTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tabLabel(key)}</Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{groups[key].length}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.lime} />
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderFavor}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState tab={tab} onCreate={() => router.push('/create' as any)} onBrowse={() => router.push('/(tabs)' as any)} />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.lime} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  summary: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  summaryGold: { color: colors.granelli },
  summaryLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 14, marginBottom: 6 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.backgroundLight,
  },
  tabActive: { backgroundColor: colors.accentDark },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '800' },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabCountActive: { backgroundColor: 'rgba(0,0,0,0.25)' },
  tabCountText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  tabCountTextActive: { color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, paddingBottom: 100 },
  card: { flexBasis: 'auto', alignSelf: 'stretch' },
  cardActions: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  flexButton: { flex: 1 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
  },
  secondaryButtonText: { color: colors.lime, fontSize: 14, fontWeight: '700' },
  dangerText: { color: colors.error },
  emptyContainer: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 12, gap: 8 },
  emptyText: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 8 },
});
