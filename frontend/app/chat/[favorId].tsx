import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, ChatMessage, Favor, CURRENCY_NAME } from '../../src/services/api';
import { SupporterProfileBorder } from '../../src/components/SupporterBadge';
import { ChatHeader } from '../../src/components/chat/ChatHeader';
import { ChatQuickReplies } from '../../src/components/chat/ChatQuickReplies';
import { ChatActionsBar } from '../../src/components/chat/ChatActionsBar';
import { MeetingPointModal } from '../../src/components/chat/MeetingPointModal';
import { MeetingPointCard } from '../../src/components/chat/MeetingPointCard';
import { formatMeetingPointMessage, parseMeetingPointMessage } from '../../src/utils/meetingPoint';
import { buildRows, ChatRow } from '../../src/utils/chatDays';
import { canComplete as mayCompleteFavor } from '../../src/utils/myFavors';
import { getCategoryVisual } from '../../src/utils/favorVisual';
import i18n from '../../src/i18n';
import { useTranslation } from 'react-i18next';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';

// Theme colors
const colors = {
  primary: '#2D5A3D',
  primaryLight: '#3D7A52',
  accent: '#F87828',
  lime: '#B8C868',
  background: '#0F1A14',
  backgroundLight: '#1A2E22',
  backgroundCard: '#1A2E22',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8C4B0',
  textMuted: '#6B8F75',
  border: '#2A4A35',
  error: '#FF5252',
  warning: '#F87828',
  granelli: '#FFD700',
};

export default function ChatScreen() {
  const { favorId } = useLocalSearchParams<{ favorId: string }>();
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [favor, setFavor] = useState<Favor | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatStatus, setChatStatus] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showPrivacyAlert, setShowPrivacyAlert] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    if (!token || !favorId) return;
    try {
      const [favorData, messagesData, statusData] = await Promise.all([
        api.getFavor(favorId, token),
        api.getMessages(favorId, token),
        api.getChatStatus(favorId, token),
      ]);
      setFavor(favorData);
      setMessages(messagesData);
      setChatStatus(statusData);
    } catch (error: any) {
      logger.debug('Error loading chat:', error);
      notify(t('common.error'), error.message || t('chat.title'));
    } finally {
      setLoading(false);
    }
  }, [token, favorId]);

  useEffect(() => {
    loadData();
    // Real-time polling every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const sendText = async (text: string, clearInput: boolean): Promise<boolean> => {
    if (!token || !favorId || !text.trim() || chatStatus?.read_only) return false;

    setSending(true);
    setSendError(null);
    try {
      const response = await api.sendMessage(favorId, text.trim(), token);

      // Check for warnings (like personal data alert)
      if (response.warnings) {
        response.warnings.forEach((w: any) => {
          if (w.type === 'personal_data') {
            setShowPrivacyAlert(true);
          }
        });
      }

      const message = response.message || response;
      setMessages(prev => [...prev, message]);
      if (clearInput) setNewMessage('');
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return true;
    } catch (error: any) {
      // Il messaggio resta nel campo: l'avviso è dentro la chat, vicino a dove si scrive
      setSendError(error.message || t('chat.errorSend'));
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => sendText(newMessage, true);

  const handleChangeText = (text: string) => {
    setNewMessage(text);
    if (sendError) setSendError(null);
  };

  const handleComplete = () => {
    if (!token || !favorId) return;
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
              await loadData();
              notify(t('common.success'), tx('Favore completato! I {0} sono stati trasferiti.', [CURRENCY_NAME]));
            } catch (error: any) {
              notify(t('common.error'), error.message || t('favor.errorComplete'));
            }
          },
        },
      ]
    );
  };

  const handleSendLocation = async () => {
    if (!token || !favorId || chatStatus?.read_only) return;
    
    setSendingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        notify(t('chat.permissionDenied'), t('chat.locationPermissionMsg'));
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      // Crea un link Google Maps
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      const locationMessage = `📍 La mia posizione attuale:\n${mapsUrl}`;
      
      await api.sendMessage(favorId, locationMessage, token);
      await loadData();
      
      notify(t('chat.locationSent'), t('chat.locationSentMsg'));
    } catch (error: any) {
      notify(t('common.error'), error.message || t('chat.errorLocation'));
    } finally {
      setSendingLocation(false);
    }
  };

  const openLocationInMaps = (message: string) => {
    // Estrai URL dalle mappe
    const urlMatch = message.match(/https:\/\/maps\.google\.com\/\?q=[\d.-]+,[\d.-]+/);
    if (urlMatch) {
      Linking.openURL(urlMatch[0]);
    }
  };

  const handleReport = async () => {
    if (!token || !favorId || !reportReason) return;
    
    const otherUser = getOtherParticipant();
    if (!otherUser?.id) return;
    
    try {
      await api.reportUserInChat(favorId, otherUser.id, reportReason, '', token);
      notify(tt('Segnalazione Inviata'), tt('Grazie per aiutarci a mantenere la community sicura.'));
      setShowReportModal(false);
      setReportReason('');
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile inviare segnalazione'));
    }
  };

  const confirmBlock = () => {
    const otherUser = getOtherParticipant();
    const otherUserId = otherUser?.id;
    if (!otherUserId) return;
    const name = otherUser?.name || tt('un vicino');
    Alert.alert(
      tx('Bloccare {0}?', [name]),
      tt('Non vedrai più i suoi favori e non potrete scrivervi. Puoi sbloccarlo dalle Impostazioni.'),
      [
        { text: tt('Annulla'), style: 'cancel' },
        { text: tt('Blocca'), style: 'destructive', onPress: () => handleBlock(otherUserId, name) },
      ]
    );
  };

  const handleBlock = async (otherUserId: string, name: string) => {
    if (!token) return;
    try {
      await api.blockUser(otherUserId, undefined, token);
      notify(tt('Utente bloccato'), name);
      router.back();
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile bloccare l\'utente'));
    }
  };

  const handleSendMeetingPoint = () => {
    setSendError(null);
    setShowMeeting(true);
  };

  const submitMeetingPoint = async (place: string, when: string) => {
    const text = formatMeetingPointMessage(place, when);
    if (!text) return;
    // La finestra si chiude solo se il messaggio è partito: altrimenti mostra il motivo
    if (await sendText(text, false)) setShowMeeting(false);
  };

  const getOtherParticipant = () => {
    if (!favor || !user) return null;
    if (favor.creator_id === user.user_id) {
      // Current user is creator, other is acceptor
      return { 
        name: favor.accepted_by_name, 
        id: favor.accepted_by,
        isSupporter: false // accepted_by supporter status not available
      };
    }
    // Current user is acceptor, other is creator
    return { 
      name: favor.creator_name, 
      id: favor.creator_id,
      isSupporter: favor.creator_is_supporter
    };
  };

  // Get supporter status for a message sender
  const getSenderIsSupporter = (senderId: string): boolean => {
    if (!favor) return false;
    if (senderId === favor.creator_id) {
      return favor.creator_is_supporter;
    }
    return false; // accepted_by supporter status not available from favor
  };

  const dayLabel = (row: Extract<ChatRow<ChatMessage>, { type: 'day' }>): string => {
    if (row.bucket.kind === 'today') return tt('Oggi');
    if (row.bucket.kind === 'yesterday') return tt('Ieri');
    return row.bucket.date.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'it-IT', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  };

  const renderRow = ({ item: row }: { item: ChatRow<ChatMessage> }) => {
    if (row.type === 'day') {
      return (
        <View style={styles.daySeparator}>
          <Text style={styles.daySeparatorText}>{dayLabel(row)}</Text>
        </View>
      );
    }
    return renderMessage(row.message);
  };

  const renderMessage = (item: ChatMessage) => {
    const isMe = item.sender_id === user?.user_id;
    const meetingPoint = item.blocked ? null : parseMeetingPointMessage(item.content);
    const messageTime = new Date(item.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const senderIsSupporter = getSenderIsSupporter(item.sender_id);
    
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
        {!isMe && (
          <View style={{ marginRight: 8 }}>
            <SupporterProfileBorder isSupporter={senderIsSupporter} size={32}>
              <View style={[styles.avatarContainer, { backgroundColor: categoryColor }]}>
                <Text style={styles.avatarText}>{item.sender_name?.charAt(0).toUpperCase()}</Text>
              </View>
            </SupporterProfileBorder>
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isMe ? styles.myBubble : styles.otherBubble,
          item.blocked && styles.blockedBubble
        ]}>
          {item.blocked && (
            <View style={styles.blockedBadge}>
              <Ionicons name="warning" size={14} color={colors.error} />
              <Text style={styles.blockedBadgeText}>{tt('Bloccato')}</Text>
            </View>
          )}
          {meetingPoint ? (
            <MeetingPointCard point={meetingPoint} time={messageTime} />
          ) : item.content.includes('maps.google.com') ? (
            <TouchableOpacity onPress={() => openLocationInMaps(item.content)}>
              <View style={styles.locationMessage}>
                <Ionicons name="location" size={20} color={colors.accent} />
                <View>
                  <Text style={styles.locationTitle}>{tt('📍 Posizione condivisa')}</Text>
                  <Text style={styles.locationLink}>{tt('Tocca per aprire in Google Maps')}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.messageText, item.blocked && styles.blockedText]}>
              {item.content}
            </Text>
          )}
          {!meetingPoint && <Text style={styles.messageTime}>{messageTime}</Text>}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.lime} />
        </View>
      </SafeAreaView>
    );
  }

  const otherParticipant = getOtherParticipant();
  const isReadOnly = chatStatus?.read_only;
  const categoryColor = getCategoryVisual(favor?.category ?? 'Altro').color;
  const rows = buildRows(messages);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ChatHeader
        favor={favor}
        currentUserId={user?.user_id}
        otherName={otherParticipant?.name}
        canComplete={!!favor && mayCompleteFavor(favor, user?.user_id)}
        onBack={() => router.back()}
        onMenu={() => setShowMenu(true)}
        onComplete={handleComplete}
      />

      <View style={styles.safetyNote}>
        <Ionicons name="shield-checkmark" size={18} color={colors.textSecondary} />
        <Text style={styles.safetyText}>
          {tt('Incontratevi in un luogo pubblico. Lo scambio è basato sul tempo, non sul denaro: siate puntuali e gentili.')}
        </Text>
      </View>

      {/* Read-Only Banner */}
      {isReadOnly && (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed" size={16} color={colors.warning} />
          <Text style={styles.readOnlyText}>{tt('Chat in sola lettura -')}{' '}{chatStatus.read_only_reason}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>{tt('Iniziate a parlare')}</Text>
              <Text style={styles.emptyText}>{tt('Salutate e accordatevi su dove e quando incontrarvi. Toccate una risposta rapida qui sotto per cominciare.')}</Text>
            </View>
          }
        />

        {/* Input Area */}
        {!isReadOnly && (
          <View style={styles.composer}>
            {sendError && (
              <View style={styles.sendError} accessibilityLiveRegion="polite">
                <Ionicons name="warning" size={16} color={colors.error} />
                <Text style={styles.sendErrorText}>{sendError}</Text>
              </View>
            )}
            <ChatQuickReplies
              disabled={sending}
              onSend={(text) => sendText(text, false)}
              onPrefill={(text) => handleChangeText(text)}
            />
            <ChatActionsBar
              sendingLocation={sendingLocation}
              onMeetingPoint={handleSendMeetingPoint}
              onLocation={handleSendLocation}
            />
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={newMessage}
                onChangeText={handleChangeText}
                placeholder={t('chat.placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={500}
                accessibilityLabel={t('chat.placeholder')}
              />

              <TouchableOpacity
                style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!newMessage.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel={tt('Invia')}
                data-testid="send-button"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Ionicons name="send" size={20} color={colors.background} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <MeetingPointModal
        visible={showMeeting}
        sending={sending}
        error={sendError}
        favorId={String(favorId)}
        token={token}
        onClose={() => setShowMeeting(false)}
        onSubmit={submitMeetingPoint}
      />

      {/* Menu ⋯: la segnalazione sta qui, non sempre in vista */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setShowReportModal(true);
              }}
              accessibilityRole="button"
              data-testid="report-button"
            >
              <Ionicons name="flag-outline" size={20} color={colors.error} />
              <Text style={styles.menuItemText}>{tx('Segnala {0}', [otherParticipant?.name || tt('un vicino')])}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                confirmBlock();
              }}
              accessibilityRole="button"
              data-testid="block-button"
            >
              <Ionicons name="ban-outline" size={20} color={colors.error} />
              <Text style={styles.menuItemText}>{tx('Blocca {0}', [otherParticipant?.name || tt('un vicino')])}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Privacy Alert Modal */}
      <Modal visible={showPrivacyAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertModal}>
            <Ionicons name="warning" size={40} color={colors.warning} />
            <Text style={styles.alertTitle}>{tt('Attenzione!')}</Text>
            <Text style={styles.alertText}>{tt('Stai condividendo dati personali (telefono o email).')}{'\n\n'}{tt('Assicurati di fidarti del tuo vicino prima di procedere.')}</Text>
            <TouchableOpacity 
              style={styles.alertButton}
              onPress={() => setShowPrivacyAlert(false)}
            >
              <Text style={styles.alertButtonText}>{tt('Ho capito')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal visible={showReportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModal}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>{tt('Segnala Utente')}</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.reportSubtitle}>{tt('Segnala')}{' '}{otherParticipant?.name}{' '}{tt('per comportamento inappropriato')}</Text>
            
            {['offensive', 'money_request', 'spam', 'inappropriate', 'other'].map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reportOption, reportReason === reason && styles.reportOptionActive]}
                onPress={() => setReportReason(reason)}
              >
                <Ionicons 
                  name={reportReason === reason ? 'radio-button-on' : 'radio-button-off'} 
                  size={20} 
                  color={reportReason === reason ? colors.primary : colors.textMuted} 
                />
                <Text style={styles.reportOptionText}>
                  {reason === 'offensive' && tt('Linguaggio offensivo')}
                  {reason === 'money_request' && tt('Richiesta di denaro')}
                  {reason === 'spam' && tt('Spam o messaggi indesiderati')}
                  {reason === 'inappropriate' && tt('Comportamento inappropriato')}
                  {reason === 'other' && tt('Altro')}
                </Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={[styles.reportSubmit, !reportReason && styles.reportSubmitDisabled]}
              onPress={handleReport}
              disabled={!reportReason}
            >
              <Text style={styles.reportSubmitText}>{tt('Invia Segnalazione')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  safetyText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  daySeparator: { alignItems: 'center', marginVertical: 12 },
  daySeparatorText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  emptyChat: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  composer: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  sendError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.4)',
  },
  sendErrorText: { flex: 1, color: '#FF8A8A', fontSize: 12.5, lineHeight: 17 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'flex-end', paddingTop: 70, paddingHorizontal: 12 },
  menuCard: {
    minWidth: 220,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  myMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  myBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: colors.backgroundCard,
    borderBottomLeftRadius: 4,
  },
  blockedBubble: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
  },
  blockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  blockedBadgeText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  blockedText: {
    color: colors.error,
    fontStyle: 'italic',
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.backgroundLight,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertModal: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.warning,
    marginTop: 12,
  },
  alertText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  alertButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  alertButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '600',
  },
  reportModal: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  reportSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.background,
  },
  reportOptionActive: {
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reportOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  reportSubmit: {
    backgroundColor: colors.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  reportSubmitDisabled: {
    backgroundColor: colors.border,
  },
  reportSubmitText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  locationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  locationTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  locationLink: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 2,
  },
});
