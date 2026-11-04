import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api, AreaMessage, NeighborhoodWeather } from '../src/services/api';
import { BrandLogo } from '../src/components/BrandLogo';
import colors from '../src/theme/colors';
import { tt, tx } from '../src/i18n/tt';
import { goBackOrHome } from '../src/utils/navigation';
import { notify, showRefusal } from '../src/utils/notify';
import { NewsTab } from '../src/components/neighborhood/NewsTab';
import { useLiveRefresh } from '../src/hooks/useLiveRefresh';

const WEATHER_REFRESH_MS = 10 * 60 * 1000;

const WEATHER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sunny: 'sunny',
  partly: 'partly-sunny',
  cloudy: 'cloud',
  fog: 'cloud-outline',
  rainy: 'rainy',
  snow: 'snow',
  thunder: 'thunderstorm',
};
const MAX_LENGTH = 300;

/** Quartiere: chat tra chi ha un favore attivo entro 30 km. I messaggi durano 2 giorni. */
export default function NeighborhoodScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const listRef = useRef<FlatList<AreaMessage>>(null);
  const lastCount = useRef(0);
  const [messages, setMessages] = useState<AreaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [weather, setWeather] = useState<NeighborhoodWeather | null>(null);
  const [tab, setTab] = useState<'chat' | 'avvisi'>('chat');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getAreaChat(token);
      setMessages(result.messages);
      setNoAccess(null);
    } catch (error: any) {
      // 403: non c'è un favore attivo. Gli altri errori (rete) si riprovano al prossimo giro.
      if (/favore attivo/i.test(error?.message || '')) setNoAccess(error.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Primo caricamento all'apertura, poi aggiornamento ogni 3 secondi finché la schermata è aperta
  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load])
  );
  useLiveRefresh(load);

  // Il meteo si aggiorna ogni 10 minuti; se non è disponibile la scheda semplicemente non compare
  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      const loadWeather = () =>
        api.getNeighborhoodWeather(token).then((result) => setWeather(result.weather)).catch(() => setWeather(null));
      loadWeather();
      const timer = setInterval(loadWeather, WEATHER_REFRESH_MS);
      return () => clearInterval(timer);
    }, [token])
  );

  useEffect(() => {
    if (messages.length > lastCount.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    lastCount.current = messages.length;
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!token || !content || sending) return;
    setSending(true);
    try {
      await api.postAreaChat(content, token);
      setText('');
      await load();
    } catch (error: any) {
      showRefusal(tt('Messaggio non inviato'), error?.message || tt('Riprova tra poco.'), tt('Ho capito'));
    } finally {
      setSending(false);
    }
  };

  const openMenu = (message: AreaMessage) => {
    if (message.mine || !token) return;
    Alert.alert(message.author_name, tt('Cosa vuoi fare con questo messaggio?'), [
      { text: tt('Annulla'), style: 'cancel' },
      {
        text: tt('Segnala il messaggio'),
        onPress: async () => {
          try {
            const result = await api.reportAreaMessage(message.message_id, token);
            notify(tt('Segnalazione inviata'), result.message);
          } catch (error: any) {
            showRefusal(tt('Errore'), error?.message || tt('Impossibile segnalare'), tt('Ho capito'));
          }
        },
      },
      {
        text: tx('Blocca {0}', [message.author_name]),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.blockUser(message.author_id, undefined, token);
            notify(tt('Utente bloccato'), message.author_name);
            load();
          } catch (error: any) {
            showRefusal(tt('Errore'), error?.message || tt('Impossibile bloccare l\'utente'), tt('Ho capito'));
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: AreaMessage }) => {
    const time = new Date(item.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={[styles.row, item.mine ? styles.rowMine : styles.rowOther]}>
        <TouchableOpacity
          style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleOther]}
          onLongPress={() => openMenu(item)}
          onPress={() => openMenu(item)}
          disabled={item.mine}
          activeOpacity={0.8}
          accessibilityLabel={`${item.author_name}: ${item.content}`}
        >
          {!item.mine && (
            <Text style={styles.author}>
              {item.author_name}
              {item.distance_km ? `  ·  ${tx('circa {0} km', [item.distance_km])}` : ''}
            </Text>
          )}
          <Text style={styles.content}>{item.content}</Text>
          {item.off_app_contact && !item.mine && (
            <View style={styles.offApp}>
              <Ionicons name="shield-half-outline" size={14} color={colors.warning} />
              <Text style={styles.offAppText}>
                {tt('Ti propone di continuare fuori dall\'app. Resta qui e non mandare soldi, codici o dati personali.')}
              </Text>
            </View>
          )}
          <Text style={styles.time}>{time}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{tt('Il quartiere parla')}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{tt('Tutto quello che succede intorno a te')}</Text>
          </View>
        </View>

        {weather && (
          <View style={styles.weatherCard} accessibilityLabel={tt('Meteo del quartiere')} data-testid="neighborhood-weather">
            <Ionicons name={WEATHER_ICONS[weather.icon] || 'partly-sunny'} size={34} color={colors.lime} />
            <View style={styles.weatherMain}>
              <Text style={styles.weatherTemp}>{weather.temperature}°</Text>
              <Text style={styles.weatherDesc}>{tt(weather.description)}</Text>
            </View>
            <View style={styles.weatherDetails}>
              <Text style={styles.weatherLine}>{tx('Oggi {0}° / {1}°', [weather.today.min, weather.today.max])}</Text>
              <Text style={styles.weatherLine}>
                {tx('Domani: {0}, {1}°', [tt(weather.tomorrow.description), weather.tomorrow.max])}
              </Text>
              {weather.today.rain_chance >= 30 && (
                <Text style={styles.weatherLine}>{tx('Pioggia oggi: {0}%', [weather.today.rain_chance])}</Text>
              )}
              <Text style={styles.weatherSource}>{tx('Meteo: {0}', [weather.source])}</Text>
            </View>
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="shield-checkmark" size={18} color={colors.textSecondary} />
          <Text style={styles.noteText}>
            {tt('Qui scrive chi ha un favore attivo entro 30 km. I messaggi durano 2 giorni. Niente soldi, codici, telefono o email: per accordarvi usate la chat del favore.')}
          </Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['chat', 'avvisi'] as const).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              data-testid={`neighborhood-tab-${key}`}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{key === 'chat' ? tt('Chat') : tt('Avvisi')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'avvisi' ? (
          <NewsTab token={token} />
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
        ) : noAccess ? (
          <View style={styles.empty} data-testid="square-no-access">
            <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{tt('Il quartiere è per chi ha un favore attivo')}</Text>
            <Text style={styles.emptyText}>{tt('Pubblica o accetta un favore per entrare e parlare con chi è vicino a te.')}</Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.message_id}
              renderItem={renderItem}
              contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>{tt('Ancora nessun messaggio')}</Text>
                  <Text style={styles.emptyText}>{tt('Scrivi tu per primo: saluta i vicini con un favore attivo.')}</Text>
                </View>
              }
            />
            <Text style={styles.rule}>{tt('Segnala, non accusare: se qualcosa non va, tocca il messaggio e segnalalo.')}</Text>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={tt('Scrivi al quartiere…')}
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_LENGTH}
                multiline
                accessibilityLabel={tt('Scrivi al quartiere')}
                data-testid="square-input"
              />
              <TouchableOpacity
                style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]}
                onPress={send}
                disabled={!text.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel={tt('Invia')}
                data-testid="square-send"
              >
                {sending ? <ActivityIndicator color={colors.background} /> : <Ionicons name="send" size={20} color={colors.background} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  titleBlock: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textSecondary, fontSize: 12.5, marginTop: 1 },
  weatherCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: colors.backgroundCard },
  weatherMain: { alignItems: 'center', minWidth: 74 },
  weatherTemp: { color: colors.textPrimary, fontSize: 26, fontWeight: '800' },
  weatherDesc: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  weatherDetails: { flex: 1, gap: 2 },
  weatherLine: { color: colors.textPrimary, fontSize: 13 },
  weatherSource: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: colors.backgroundCard },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.background, fontWeight: '800' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: colors.backgroundCard },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 12, paddingBottom: 8 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 8, marginTop: 40 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  row: { flexDirection: 'row', marginVertical: 4 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: colors.accentDark },
  bubbleOther: { backgroundColor: colors.backgroundCard },
  author: { color: colors.lime, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  content: { color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
  time: { color: colors.textMuted, fontSize: 11, alignSelf: 'flex-end', marginTop: 4 },
  offApp: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(248,120,40,0.35)' },
  offAppText: { flex: 1, color: colors.warning, fontSize: 12, lineHeight: 16 },
  rule: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, paddingTop: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.backgroundLight },
  input: { flex: 1, maxHeight: 110, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.backgroundCard, color: colors.textPrimary, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.85 },
});
