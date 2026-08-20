import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  Text as RNText,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { KeyboardAvoidingView as KCAvoidingView } from 'react-native-keyboard-controller';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  screenKeyboardVerticalOffset,
} from '../../utils/keyboardAvoiding';
import { getThreadMessages, sendThreadMessage } from '../../api/client';
import { uploadPhotoToR2 } from '../../services/uploadToR2';
import { useInboxCountsStore } from '../../store/inboxCountsStore';
import { extractApiError } from '../../utils/feedback';
import { formatMessageTime } from '../../constants/notifications';
import type { MessagesStackParamList } from '../../navigation/types';
import { ContactSupportModal } from '../../components/ContactSupportModal';
import {
  MessageComposer,
  type PendingComposerPhoto,
} from '../../components/messaging/MessageComposer';
import { SUPPORT_TICKET_CONTEXT } from '../../../shared/src/supportDesk';

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
  attachment_url?: string | null;
  attachment_preview_url?: string | null;
};

type Route = RouteProp<MessagesStackParamList, 'MessageDetail'>;
type Nav = NativeStackNavigationProp<MessagesStackParamList, 'MessageDetail'>;

const POLL_MS = 8000;

export function MessageDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { threadId, title: paramTitle, contextType: paramContext, supportStatus: paramStatus } =
    route.params;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [otherName, setOtherName] = useState('Conversation');
  const [threadTitle, setThreadTitle] = useState<string | null>(paramTitle ?? null);
  const [contextType, setContextType] = useState<string | null>(paramContext ?? null);
  const [supportStatus, setSupportStatus] = useState<string | null>(paramStatus ?? null);
  const [newMessage, setNewMessage] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<PendingComposerPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  const isSupportTicket = contextType === SUPPORT_TICKET_CONTEXT;
  const isResolved = isSupportTicket && supportStatus === 'resolved';
  const headerLabel = isSupportTicket
    ? threadTitle?.trim() || otherName || 'Support request'
    : otherName;

  const load = useCallback(async () => {
    try {
      const data = await getThreadMessages(threadId);
      setMessages(data.messages ?? []);
      if (data.otherUser?.name) setOtherName(data.otherUser.name);
      if (data.title !== undefined) setThreadTitle(data.title);
      if (data.context_type !== undefined) setContextType(data.context_type);
      if (data.support_status !== undefined) setSupportStatus(data.support_status);
      setError(null);
      void useInboxCountsStore.getState().refresh();
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
    if ((!text && !pendingPhoto) || sending || isResolved) return;
    setSending(true);
    try {
      let attachmentUrl: string | undefined;
      if (pendingPhoto) {
        const uploaded = await uploadPhotoToR2({
          purpose: 'support_attachment',
          localUri: pendingPhoto.uri,
          mimeType: pendingPhoto.mimeType,
          base64: pendingPhoto.base64,
        });
        attachmentUrl = uploaded.objectKey;
      }
      await sendThreadMessage(threadId, text, attachmentUrl);
      setNewMessage('');
      setPendingPhoto(null);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  const screen = (
    <>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate('MessagesList');
          }}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.headerTitles}>
          <RNText style={styles.headerTitle} numberOfLines={1}>
            {headerLabel}
          </RNText>
          {isSupportTicket ? (
            <RNText style={styles.headerSubtitle} numberOfLines={1}>
              Support · {isResolved ? 'Resolved' : 'Open'}
              {otherName ? ` · ${otherName}` : ''}
            </RNText>
          ) : null}
        </View>
      </View>

      {isResolved ? (
        <View style={styles.resolvedBanner}>
          <View style={styles.resolvedRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
            <Text style={styles.resolvedTitle}>This support request is resolved</Text>
          </View>
          <Text style={styles.resolvedMessage}>
            You can still read the conversation. To ask something new, start a fresh support request.
          </Text>
          <Pressable style={styles.newRequestBtn} onPress={() => setSupportOpen(true)}>
            <Text className="text-[13px] font-bold text-white">Start a new support request</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && messages.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={COLORS.primary} />
      ) : error && messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages in this conversation yet.</Text>
          }
          renderItem={({ item }) => {
            const mine = item.is_mine;
            const preview =
              item.attachment_preview_url?.trim() ||
              (item.attachment_url?.startsWith('http') ? item.attachment_url.trim() : '');
            const hasStoredAttachment = !!item.attachment_url?.trim();
            const hidePlaceholderText =
              !!preview && (!item.content.trim() || item.content.trim() === 'Photo attachment');
            return (
              <View style={[styles.bubble, mine ? styles.sent : styles.received]}>
                {!hidePlaceholderText && item.content.trim() ? (
                  <Text style={[styles.bubbleText, mine && styles.sentText]}>{item.content}</Text>
                ) : null}
                {preview ? (
                  <Image source={{ uri: preview }} style={styles.attachment} resizeMode="cover" />
                ) : hasStoredAttachment ? (
                  <Text style={[styles.attachmentHint, mine && styles.sentText]}>📷 Photo attached</Text>
                ) : null}
                <Text style={[styles.time, mine && styles.sentTime]}>
                  {formatMessageTime(item.created_at)}
                </Text>
              </View>
            );
          }}
        />
      )}

      {error && messages.length > 0 ? <Text style={styles.error}>{error}</Text> : null}

      {isResolved ? (
        <View style={[styles.readOnlyBar, { paddingBottom: 12 + Math.max(insets.bottom, 0) }]}>
          <Text style={styles.readOnlyText}>Messaging is closed on resolved tickets.</Text>
        </View>
      ) : (
        <MessageComposer
          placeholder="Type a message..."
          maxLength={2000}
          sending={sending}
          disabled={false}
          sendColor={COLORS.primary}
          bottomInset={insets.bottom}
          value={newMessage}
          onChangeText={setNewMessage}
          pendingPhoto={pendingPhoto}
          onPendingPhotoChange={setPendingPhoto}
          onSend={() => void handleSend()}
        />
      )}
    </>
  );

  const supportModal = (
      <ContactSupportModal
        visible={supportOpen}
        onClose={() => setSupportOpen(false)}
        onCreated={(newThreadId) => {
          navigation.dispatch(
            CommonActions.reset({
              index: 1,
              routes: [
                { name: 'MessagesList' },
                {
                  name: 'MessageDetail',
                  params: {
                    threadId: newThreadId,
                    contextType: SUPPORT_TICKET_CONTEXT,
                    supportStatus: 'open',
                  },
                },
              ],
            })
          );
        }}
      />
  );

  if (isWeb) {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={KEYBOARD_AVOIDING_BEHAVIOR}
          keyboardVerticalOffset={screenKeyboardVerticalOffset(90)}
        >
          {screen}
        </KeyboardAvoidingView>
        {supportModal}
      </>
    );
  }

  return (
    <>
      <KCAvoidingView style={styles.container} behavior="padding">
        {screen}
      </KCAvoidingView>
      {supportModal}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 4,
  },
  backBtn: { padding: 4 },
  headerTitles: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { textAlign: 'center', color: COLORS.muted, paddingVertical: 24 },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#1F4E78',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  attachment: {
    width: 180,
    height: 140,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#ddd',
  },
  attachmentHint: { fontSize: 12, marginTop: 6, color: COLORS.muted },
  resolvedBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  resolvedTitle: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  resolvedMessage: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  newRequestBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#1F4E78',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
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
  readOnlyBar: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  readOnlyText: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
});
