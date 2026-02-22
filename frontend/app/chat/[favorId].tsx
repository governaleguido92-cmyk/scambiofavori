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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api, ChatMessage, Favor } from '../src/services/api';

export default function ChatScreen() {
  const { favorId } = useLocalSearchParams<{ favorId: string }>();
  const { user, token } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [favor, setFavor] = useState<Favor | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    if (!token || !favorId) return;
    try {
      const [favorData, messagesData] = await Promise.all([
        api.getFavor(favorId, token),
        api.getMessages(favorId, token),
      ]);
      setFavor(favorData);
      setMessages(messagesData);
    } catch (error: any) {
      console.log('Error loading chat:', error);
      Alert.alert('Errore', error.message || 'Impossibile caricare la chat');
    } finally {
      setLoading(false);
    }
  }, [token, favorId]);

  useEffect(() => {
    loadData();
    // Poll for new messages every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSend = async () => {
    if (!token || !favorId || !newMessage.trim()) return;
    
    setSending(true);
    try {
      const message = await api.sendMessage(favorId, newMessage.trim(), token);
      setMessages(prev => [...prev, message]);
      setNewMessage('');
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      Alert.alert('Messaggio Bloccato', error.message || 'Errore invio messaggio');
    } finally {
      setSending(false);
    }
  };

  const getOtherParticipant = () => {
    if (!favor || !user) return null;
    if (favor.creator_id === user.user_id) {
      return { name: favor.accepted_by_name, id: favor.accepted_by };
    }
    return { name: favor.creator_name, id: favor.creator_id };
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === user?.user_id;
    const isBlocked = item.blocked;

    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.messageContainerMe : styles.messageContainerOther
      ]}>
        {!isMe && (
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarTextSmall}>
              {item.sender_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
          isBlocked && styles.messageBubbleBlocked
        ]}>
          {isBlocked && (
            <View style={styles.blockedBadge}>
              <Ionicons name="warning" size={12} color="#ff6b6b" />
              <Text style={styles.blockedText}>Bloccato</Text>
            </View>
          )}
          <Text style={[
            styles.messageText,
            isMe ? styles.messageTextMe : styles.messageTextOther,
            isBlocked && styles.messageTextBlocked
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            isMe ? styles.messageTimeMe : styles.messageTimeOther
          ]}>
            {new Date(item.created_at).toLocaleTimeString('it-IT', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </View>
    );
  };

  const otherParticipant = getOtherParticipant();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {otherParticipant?.name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>{otherParticipant?.name || 'Chat'}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {favor?.title}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.infoButton}
          onPress={() => router.push(`/favor/${favorId}` as any)}
        >
          <Ionicons name="information-circle" size={24} color="#4ecca3" />
        </TouchableOpacity>
      </View>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="shield-checkmark" size={16} color="#4ecca3" />
        <Text style={styles.warningText}>
          I messaggi con riferimenti a denaro reale vengono bloccati automaticamente
        </Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubbles-outline" size={60} color="#333" />
            <Text style={styles.emptyChatText}>Nessun messaggio</Text>
            <Text style={styles.emptyChatSubtext}>
              Inizia la conversazione per organizzare lo scambio!
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.message_id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Scrivi un messaggio..."
            placeholderTextColor="#666"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4ecca3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 12,
    maxWidth: 180,
  },
  infoButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  warningText: {
    color: '#888',
    fontSize: 11,
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyChatText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptyChatSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
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
  messageContainerMe: {
    justifyContent: 'flex-end',
  },
  messageContainerOther: {
    justifyContent: 'flex-start',
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarTextSmall: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: 'bold',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  messageBubbleMe: {
    backgroundColor: '#4ecca3',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#16213e',
    borderBottomLeftRadius: 4,
  },
  messageBubbleBlocked: {
    backgroundColor: '#2a1a1a',
    borderWidth: 1,
    borderColor: '#ff6b6b33',
  },
  blockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  blockedText: {
    color: '#ff6b6b',
    fontSize: 10,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextMe: {
    color: '#1a1a2e',
  },
  messageTextOther: {
    color: '#fff',
  },
  messageTextBlocked: {
    color: '#888',
    fontStyle: 'italic',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  messageTimeMe: {
    color: '#1a1a2e99',
    textAlign: 'right',
  },
  messageTimeOther: {
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#1a1a2e',
  },
  input: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    marginRight: 12,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ecca3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
});
