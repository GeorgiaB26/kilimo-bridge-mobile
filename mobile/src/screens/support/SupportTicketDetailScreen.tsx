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
  Image,
  Alert,
  Text as RNText,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import {
  getSupportTicket,
  replySupportTicket,
  resolveSupportTicket,
  type SupportTicketMessage,
  type SupportTicketSummary,
} from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { formatMessageTime } from '../../constants/notifications';
import type { SupportMessagesStackParamList } from '../../navigation/types';

type Route = RouteProp<SupportMessagesStackParamList, 'SupportTicketDetail'>;
type Nav = NativeStackNavigationProp<SupportMessagesStackParamList, 'SupportTicketDetail'>;

const POLL_MS = 8000;

export function SupportTicketDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { threadId, subject: paramSubject, status: paramStatus } = route.params;

  const [ticket, setTicket] = useState<SupportTicketSummary | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [canReply, setCanReply] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = ticket?.status ?? paramStatus ?? 'open';
  const isResolved = status === 'resolved';
  const subject = ticket?.subject ?? paramSubject ?? 'Support ticket';

  const load = useCallback(async () => {
    try {
      const data = await getSupportTicket(threadId);
      setTicket(data.ticket);
      setMessages(data.messages ?? []);
      setCanReply(data.can_reply);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load ticket'));
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

  /** Always return to the inbox list — deep links often have no list under this screen. */
  const goToInbox = () => {
    navigation.navigate('SupportTicketsList', { statusFilter: isResolved ? 'resolved' : 'open' });
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending || !canReply) return;
    setSending(true);
    try {
      await replySupportTicket(threadId, { content: text });
      setNewMessage('');
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not send reply'));
    } finally {
      setSending(false);
    }
  };

  const confirmResolve = () => {
    if (resolving || isResolved) return;
    const run = async () => {
      setResolving(true);
      try {
        const data = await resolveSupportTicket(threadId);
        setTicket(data.ticket);
        showMessage('Ticket resolved', 'The requester has been notified.');
        await load();
      } catch (err) {
        setError(extractApiError(err, 'Could not resolve ticket'));
      } finally {
        setResolving(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Mark this support ticket as resolved?')) {
        void run();
      }
      return;
    }
    Alert.alert('Resolve ticket', 'Mark this support ticket as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', style: 'default', onPress: () => void run() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <Pressable
          onPress={goToInbox}
          style={styles.backBtn}
          accessibilityLabel="Back to inbox"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.headerTitles}>
          <RNText style={styles.headerTitle} numberOfLines={1}>
            {subject}
          </RNText>
          <RNText style={styles.headerSubtitle} numberOfLines={1}>
            {isResolved ? 'Resolved' : 'Open'}
            {ticket?.requester_name ? ` · ${ticket.requester_name}` : ''}
            {ticket?.requester_phone ? ` · ${ticket.requester_phone}` : ''}
          </RNText>
        </View>
        {!isResolved ? (
          <Pressable
            style={[styles.resolveBtn, resolving && styles.disabled]}
            onPress={confirmResolve}
            disabled={resolving}
          >
            <RNText style={styles.resolveText}>{resolving ? '…' : 'Resolve'}</RNText>
          </Pressable>
        ) : null}
      </View>

      {isResolved ? (
        <View style={styles.resolvedBanner}>
          <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
          <Text style={styles.resolvedText}>
            This ticket is resolved. Replies are still allowed for follow-up.
          </Text>
        </View>
      ) : null}

      {loading && messages.length === 0 ? (
        <ActivityIndicator style={styles.loader} color="#1F4E78" />
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
                {!mine && item.sender_name ? (
                  <Text style={styles.senderName}>{item.sender_name}</Text>
                ) : null}
                {mine ? (
                  <RNText style={[styles.bubbleText, styles.sentText]}>{item.content}</RNText>
                ) : (
                  <Text style={styles.bubbleText}>{item.content}</Text>
                )}
                {item.attachment_preview_url ? (
                  <Image
                    source={{ uri: item.attachment_preview_url }}
                    style={styles.attachment}
                    resizeMode="cover"
                  />
                ) : null}
                {mine ? (
                  <RNText style={[styles.time, styles.sentTime]}>
                    {formatMessageTime(item.created_at)}
                  </RNText>
                ) : (
                  <Text style={styles.time}>{formatMessageTime(item.created_at)}</Text>
                )}
              </View>
            );
          }}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={canReply ? 'Reply to requester…' : 'Replies closed'}
          placeholderTextColor={COLORS.muted}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={4000}
          editable={canReply && !sending}
        />
        <Pressable
          style={[styles.sendBtn, (sending || !canReply) && styles.disabled]}
          onPress={handleSend}
          disabled={sending || !canReply}
        >
          <RNText style={styles.sendText}>{sending ? '…' : 'Send'}</RNText>
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
    backgroundColor: '#1F4E78',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 4,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerTitles: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  resolveBtn: {
    backgroundColor: '#2E7D5E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resolveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  resolvedText: { flex: 1, fontSize: 13, color: COLORS.text },
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
    backgroundColor: '#1F4E78',
  },
  received: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F2',
  },
  senderName: { fontSize: 11, fontWeight: '700', color: COLORS.muted, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: '#111' },
  sentText: { color: '#fff' },
  attachment: {
    width: 180,
    height: 140,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#ddd',
  },
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
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  sendBtn: {
    backgroundColor: '#1F4E78',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
