import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getThreadMessages, sendThreadMessage } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { formatMessageTime } from '../../constants/notifications';
import type { MessagesStackParamList } from '../../navigation/types';

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
};

type Route = RouteProp<MessagesStackParamList, 'MessageDetail'>;

const POLL_MS = 8000;

export function MessageDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { threadId } = route.params;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [otherName, setOtherName] = useState('Conversation');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getThreadMessages(threadId);
      setMessages(data.messages ?? []);
      if (data.otherUser?.name) setOtherName(data.otherUser.name);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load messages'));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendThreadMessage(threadId, text);
      setNewMessage('');
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{otherName}</Text>
      </View>

      {loading && messages.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={COLORS.primary} />
      ) : (
        <FlatList
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const mine = item.is_mine;
            return (
              <View style={[styles.bubble, mine ? styles.sent : styles.received]}>
                <Text style={[styles.bubbleText, mine && styles.sentText]}>{item.content}</Text>
                <Text style={[styles.time, mine && styles.sentTime]}>
                  {formatMessageTime(item.created_at)}
                </Text>
              </View>
            );
          }}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.muted}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={[styles.sendBtn, sending && styles.sendDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontWeight: '600' },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  loader: { marginTop: 40 },
  list: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 8 },
  bubble: {
    maxWidth: '82%',
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
  },
  sent: {
    alignSelf: 'flex-end',
    backgroundColor: '#4472C4',
  },
  received: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F2',
  },
  bubbleText: { fontSize: 14, color: '#111' },
  sentText: { color: '#fff' },
  time: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  sentTime: { color: 'rgba(255,255,255,0.75)' },
  error: { color: '#c0392b', paddingHorizontal: 12, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '700' },
});
