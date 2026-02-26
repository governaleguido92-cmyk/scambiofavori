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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, ChatMessage, Favor, CURRENCY_SYMBOL } from '../../src/services/api';
import { SupporterBadge, SupporterProfileBorder, UserNameWithBadge } from '../../src/components/SupporterBadge';

// Theme colors
const colors = {
  primary: '#2D5A3D',
  primaryLight: '#3D7A52',
  accent: '#E07B39',
  background: '#0F1A14',
  backgroundLight: '#1A2E22',
  backgroundCard: '#162419',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8C4B0',
  textMuted: '#6B8F75',
  border: '#2A4A35',
  error: '#FF5252',
  warning: '#FF9800',
  granelli: '#FFD700',
};

export default function ChatScreen() {
  const { favorId } = useLocalSearchParams<{ favorId: string }>();
  const { user, token } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [favor, setFavor] = useState<Favor | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatStatus, setChatStatus] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showPrivacyAlert, setShowPrivacyAlert] = useState(false);
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
      console.log('Error loading chat:', error);
      Alert.alert('Errore', error.message || 'Impossibile caricare la chat');
    } finally {
      setLoading(false);
    }
  }, [token, favorId]);

  useEffect(() => {
    loadData();
    // Real-time polling every 3 seconds
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSend = async () => {
    if (!token || !favorId || !newMessage.trim() || chatStatus?.read_only) return;
    
    setSending(true);
    try {
      const response = await api.sendMessage(favorId, newMessage.trim(), token);
      
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
      setNewMessage('');
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      Alert.alert('Messaggio Bloccato', error.message || 'Errore invio messaggio');
    } finally {
      setSending(false);
    }
  };

  const handleReport = async () => {
    if (!token || !favorId || !reportReason) return;
    
    const otherUser = getOtherParticipant();
    if (!otherUser?.id) return;
    
    try {
      await api.reportUserInChat(favorId, otherUser.id, reportReason, '', token);
      Alert.alert('Segnalazione Inviata', 'Grazie per aiutarci a mantenere la community sicura.');
      setShowReportModal(false);
      setReportReason('');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile inviare segnalazione');
    }
  };

  const handleSendMeetingPoint = () => {
    Alert.alert(
      'Punto di Incontro',
      'Seleziona un luogo pubblico per incontrarvi in sicurezza',
      [
        { text: 'Annulla', style: 'cancel' },
        { 
          text: 'Piazza/Centro', 
          onPress: () => sendMeetingPointMessage('Piazza del Centro', 'Incontriamoci nella piazza centrale')
        },
        { 
          text: 'Bar/Caffè', 
          onPress: () => sendMeetingPointMessage('Bar/Caffè', 'Incontriamoci al bar più vicino')
        },
      ]
    );
  };

  const sendMeetingPointMessage = async (place: string, message: string) => {
    if (!token || !favorId) return;
    try {
      const response = await api.sendMessage(favorId, `📍 ${message} - ${place}`, token);
      const msg = response.message || response;
      setMessages(prev => [...prev, msg]);
    } catch (error: any) {
      Alert.alert('Errore', error.message);
    }
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === user?.user_id;
    const senderIsSupporter = getSenderIsSupporter(item.sender_id);
    
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
        {!isMe && (
          <View style={{ marginRight: 8 }}>
            <SupporterProfileBorder isSupporter={senderIsSupporter} size={32}>
              <View style={styles.avatarContainer}>
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
              <Ionicons name="warning" size={12} color={colors.error} />
              <Text style={styles.blockedBadgeText}>Bloccato</Text>
            </View>
          )}
          {/* Show sender name with badge for other's messages */}
          {!isMe && (
            <View style={styles.senderNameRow}>
              <UserNameWithBadge 
                name={item.sender_name || 'Utente'} 
                isSupporter={senderIsSupporter}
                nameStyle={styles.senderNameText}
              />
            </View>
          )}
          <Text style={[styles.messageText, item.blocked && styles.blockedText]}>
            {item.content}
          </Text>
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const otherParticipant = getOtherParticipant();
  const isReadOnly = chatStatus?.read_only;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Favor Info */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {favor?.title || 'Chat'}
          </Text>
          <View style={styles.headerSubRow}>
            <UserNameWithBadge 
              name={`con ${otherParticipant?.name || 'Utente'}`}
              isSupporter={otherParticipant?.isSupporter || false}
              nameStyle={styles.headerSubtitle}
            />
            <View style={styles.granelliBadge}>
              <Text style={styles.granelliText}>{CURRENCY_SYMBOL} {favor?.granelli_cost || 0}</Text>
            </View>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.reportButton} 
          onPress={() => setShowReportModal(true)}
          data-testid="report-button"
        >
          <Ionicons name="flag" size={22} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* Ethical Reminder Banner */}
      <View style={styles.ethicalBanner}>
        <Ionicons name="heart" size={16} color={colors.primary} />
        <Text style={styles.ethicalText}>
          Ricorda: lo scambio è basato sul tempo, non sul denaro. Sii puntuale e gentile.
        </Text>
      </View>

      {/* Read-Only Banner */}
      {isReadOnly && (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed" size={16} color={colors.warning} />
          <Text style={styles.readOnlyText}>
            Chat in sola lettura - {chatStatus.read_only_reason}
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
          data={messages}
          keyExtractor={(item) => item.message_id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input Area */}
        {!isReadOnly && (
          <View style={styles.inputContainer}>
            {/* Meeting Point Button */}
            <TouchableOpacity 
              style={styles.meetingButton} 
              onPress={handleSendMeetingPoint}
              data-testid="meeting-point-button"
            >
              <Ionicons name="location" size={22} color={colors.accent} />
            </TouchableOpacity>
            
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Scrivi un messaggio..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity 
              style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]} 
              onPress={handleSend}
              disabled={!newMessage.trim() || sending}
              data-testid="send-button"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="send" size={20} color={colors.background} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Privacy Alert Modal */}
      <Modal visible={showPrivacyAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertModal}>
            <Ionicons name="warning" size={40} color={colors.warning} />
            <Text style={styles.alertTitle}>Attenzione!</Text>
            <Text style={styles.alertText}>
              Stai condividendo dati personali (telefono o email).{'\n\n'}
              Assicurati di fidarti del tuo vicino prima di procedere.
            </Text>
            <TouchableOpacity 
              style={styles.alertButton}
              onPress={() => setShowPrivacyAlert(false)}
            >
              <Text style={styles.alertButtonText}>Ho capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal visible={showReportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModal}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>Segnala Utente</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.reportSubtitle}>
              Segnala {otherParticipant?.name} per comportamento inappropriato
            </Text>
            
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
                  {reason === 'offensive' && 'Linguaggio offensivo'}
                  {reason === 'money_request' && 'Richiesta di denaro'}
                  {reason === 'spam' && 'Spam o messaggi indesiderati'}
                  {reason === 'inappropriate' && 'Comportamento inappropriato'}
                  {reason === 'other' && 'Altro'}
                </Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={[styles.reportSubmit, !reportReason && styles.reportSubmitDisabled]}
              onPress={handleReport}
              disabled={!reportReason}
            >
              <Text style={styles.reportSubmitText}>Invia Segnalazione</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  granelliBadge: {
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  granelliText: {
    color: colors.granelli,
    fontSize: 12,
    fontWeight: '600',
  },
  reportButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ethicalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ethicalText: {
    flex: 1,
    fontSize: 12,
    color: colors.primary,
    fontStyle: 'italic',
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
  senderNameRow: {
    marginBottom: 4,
  },
  senderNameText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
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
    fontSize: 10,
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
    fontSize: 10,
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
  meetingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 13,
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
});
