import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useMessages } from '../src/context/MessagesContext';
import { BrandLogo } from '../src/components/BrandLogo';
import colors from '../src/theme/colors';
import {
  ConversationFilter,
  ConversationSummary,
  filterConversations,
  filterCounts,
  formatConversationTime,
  previewText,
} from '../src/utils/conversations';
import { tt } from '../src/i18n/tt';
import { goBackOrHome } from '../src/utils/navigation';
import { useLiveRefresh } from '../src/hooks/useLiveRefresh';

const FILTERS: ReadonlyArray<{ key: ConversationFilter; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'unread', label: 'Non letti' },
  { key: 'closed', label: 'Conclusi' },
];

const EMPTY_BY_FILTER: Record<ConversationFilter, { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = {
  all: {
    icon: 'chatbubbles-outline',
    title: 'Nessun messaggio',
    text: 'Quando scriverai a qualcuno per un favore, la conversazione comparirà qui.',
  },
  unread: {
    icon: 'checkmark-done-outline',
    title: 'Sei in pari',
    text: 'Non hai messaggi da leggere.',
  },
  closed: {
    icon: 'lock-closed-outline',
    title: 'Nessuna chat conclusa',
    text: 'Le chat dei favori completati o annullati compariranno qui.',
  },
};

/** Elenco delle persone con cui hai scritto, una riga per favore. Se il favore è concluso la chat è solo da leggere. */
export default function ConversationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { conversations, loading, failed, refresh } = useMessages();
  useLiveRefresh(refresh);  // elenco delle conversazioni aggiornato ogni 3 secondi
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const counts = useMemo(() => filterCounts(conversations), [conversations]);
  const visible = useMemo(() => filterConversations(conversations, filter, query), [conversations, filter, query]);
  const searching = query.trim().length > 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openChat = (conversation: ConversationSummary) => {
    router.push(`/chat/${conversation.favor_id}` as never);
  };

  const renderItem = ({ item }: { item: ConversationSummary }) => {
    const hasUnread = item.unread > 0;
    const mine = item.last_message.sender_id === user?.user_id;
    return (
      <TouchableOpacity
        style={[styles.row, hasUnread && styles.rowUnread]}
        onPress={() => openChat(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.other_user_name}, ${item.favor_title}${hasUnread ? `, ${item.unread} ${tt('non letti')}` : ''}`}
        data-testid={`conversation-${item.favor_id}`}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.other_user_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.topLine}>
            <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>{item.other_user_name}</Text>
            <Text style={styles.time}>{formatConversationTime(item.last_message.created_at)}</Text>
          </View>
          <Text style={styles.favorTitle} numberOfLines={1}>{item.favor_title}</Text>
          <View style={styles.bottomLine}>
            <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
              {previewText(item.last_message, mine, tt('Tu'))}
            </Text>
            {hasUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
              </View>
            )}
          </View>
          {!item.can_write && (
            <View style={styles.closedTag}>
              <Ionicons name="lock-closed" size={11} color={colors.textPrimary} />
              <Text style={styles.closedText}>{tt('Favore concluso: chat chiusa')}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (failed && conversations.length === 0) {
      return (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={56} color={colors.textPrimary} />
          <Text style={styles.emptyTitle}>{tt('Non riesco a caricare i messaggi')}</Text>
          <Text style={styles.emptyText}>{tt('Controlla la connessione e riprova.')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refresh()} accessibilityRole="button">
            <Text style={styles.retryText}>{tt('Riprova')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (searching) {
      return (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={56} color={colors.textPrimary} />
          <Text style={styles.emptyTitle}>{tt('Nessun risultato')}</Text>
          <Text style={styles.emptyText}>{tt('Prova con un altro nome o un altro titolo.')}</Text>
        </View>
      );
    }
    const content = EMPTY_BY_FILTER[filter];
    return (
      <View style={styles.empty}>
        <Ionicons name={content.icon} size={56} color={colors.textPrimary} />
        <Text style={styles.emptyTitle}>{tt(content.title)}</Text>
        <Text style={styles.emptyText}>{tt(content.text)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.column}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => goBackOrHome(router)}
            accessibilityRole="button"
            accessibilityLabel={tt('Indietro')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <BrandLogo />
          <Text style={styles.title}>{tt('Messaggi')}</Text>
        </View>

        <TouchableOpacity
          style={styles.squareCard}
          onPress={() => router.push('/quartiere' as never)}
          accessibilityRole="button"
          accessibilityLabel={tt('Il quartiere parla')}
          data-testid="open-neighborhood"
        >
          <Ionicons name="people" size={22} color={colors.accent} />
          <View style={styles.squareText}>
            <Text style={styles.squareTitle}>{tt('Il quartiere parla')}</Text>
            <Text style={styles.squareSubtitle}>{tt('Chatta con chi ha un favore attivo entro 30 km')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textPrimary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={tt('Cerca persona o favore')}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={tt('Cerca persona o favore')}
          />
          {searching && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={tt('Cancella la ricerca')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filters} accessibilityRole="tablist">
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filter, active && styles.filterActive]}
                onPress={() => setFilter(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                data-testid={`conversation-filter-${key}`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{tt(label)}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{counts[key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading && conversations.length === 0 && !failed ? (
        <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.favor_id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={visible.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={renderEmpty()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  squareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  squareText: { flex: 1 },
  squareTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  squareSubtitle: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  container: { flex: 1, backgroundColor: colors.background },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  filter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.accentDark, borderColor: colors.accentDark },
  filterText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  filterTextActive: { fontWeight: '800' },
  filterCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountActive: { backgroundColor: colors.textPrimary },
  filterCountText: { color: colors.textPrimary, fontSize: 11, fontWeight: '800' },
  filterCountTextActive: { color: colors.accentDark },
  loader: { marginTop: 48 },
  list: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: { borderColor: colors.accent },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  nameUnread: { fontWeight: '800' },
  time: { color: colors.textPrimary, fontSize: 12 },
  favorTitle: { color: colors.lime, fontSize: 12, fontWeight: '600' },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, color: colors.textPrimary, fontSize: 14, opacity: 0.85 },
  previewUnread: { opacity: 1, fontWeight: '700' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.background, fontSize: 12, fontWeight: '900' },
  closedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.backgroundLight,
  },
  closedText: { color: colors.textPrimary, fontSize: 11, fontWeight: '600' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.textPrimary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.background, fontSize: 15, fontWeight: '800' },
});
