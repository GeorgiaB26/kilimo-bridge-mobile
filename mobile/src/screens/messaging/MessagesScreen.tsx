import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import {
  getMessageContacts,
  getMessageThreads,
  startMessageThread,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';
import { formatTimeAgo } from '../../constants/notifications';
import type { MessagesStackParamList } from '../../navigation/types';

type ThreadRow = {
  id: string;
  other_user_name: string;
  last_message_content: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type Nav = NativeStackNavigationProp<MessagesStackParamList, 'MessagesList'>;

const POLL_MS = 10000;

export function MessagesScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const isFarmer = user?.role === 'farmer';
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [contacts, setContacts] = useState<Array<{ userId: string; name: string; role: string }>>([]);

  const load = useCallback(async () => {
    try {
      const data = await getMessageThreads(search.trim() || undefined);
      setThreads((data.threads ?? []) as ThreadRow[]);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load messages'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openNewChat = async () => {
    try {
      const data = await getMessageContacts();
      setContacts(data.contacts ?? []);
      setShowNew(true);
    } catch {
      setContacts([]);
      setShowNew(true);
    }
  };

  const startChat = async (recipientId: string) => {
    try {
      const { threadId } = await startMessageThread(recipientId);
      setShowNew(false);
      navigation.navigate('MessageDetail', { threadId });
    } catch (err) {
      setError(extractApiError(err, 'Could not start conversation'));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={COLORS.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={COLORS.muted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          returnKeyType="search"
        />
        <Pressable onPress={openNewChat} style={styles.newBtn} accessibilityLabel="New message">
          <Ionicons name="create-outline" size={22} color={COLORS.primary} />
        </Pressable>
      </View>

      {showNew && (
        <View style={styles.contactPicker}>
          <Text style={styles.pickerTitle}>
            {isFarmer ? 'Message your support team' : 'Start a conversation'}
          </Text>
          {contacts.length === 0 ? (
            <Text style={styles.muted}>No contacts available yet.</Text>
          ) : (
            contacts.map((c) => (
              <Pressable key={c.userId} style={styles.contactRow} onPress={() => startChat(c.userId)}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactRole}>
                  {c.role === 'field_agent' ? 'Field Agent' : c.role === 'tech_support' ? 'Tech Support' : c.role}
                </Text>
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setShowNew(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {isFarmer && !showNew && threads.length === 0 && !loading ? (
        <View style={styles.contactPicker}>
          <Text style={styles.pickerTitle}>Start a conversation</Text>
          <Pressable onPress={openNewChat} style={styles.contactRow}>
            <Text style={styles.contactName}>Chat with your field agent or tech support</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && threads.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={COLORS.primary} />
      ) : error && threads.length === 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No conversations yet. Tap ✎ to message someone.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.threadCard}
              onPress={() => navigation.navigate('MessageDetail', { threadId: item.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.other_user_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.threadBody}>
                <View style={styles.threadHeader}>
                  <Text style={styles.participantName} numberOfLines={1}>
                    {item.other_user_name}
                  </Text>
                  {item.last_message_at ? (
                    <Text style={styles.timestamp}>{formatTimeAgo(item.last_message_at)}</Text>
                  ) : null}
                </View>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.last_message_content ?? 'No messages yet'}
                </Text>
              </View>
              {item.unread_count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#111' },
  newBtn: { padding: 8 },
  contactPicker: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pickerTitle: { fontWeight: '700', marginBottom: 8, fontSize: 15 },
  contactRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  contactName: { fontWeight: '600', fontSize: 15 },
  contactRole: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  cancelText: { color: COLORS.primary, marginTop: 8, fontWeight: '600' },
  muted: { color: COLORS.muted },
  loader: { marginTop: 40 },
  errorText: { color: '#c0392b', padding: 16, textAlign: 'center' },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ecea',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  threadBody: { flex: 1 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  participantName: { fontWeight: '700', fontSize: 15, flex: 1 },
  timestamp: { fontSize: 12, color: COLORS.muted },
  preview: { fontSize: 14, color: COLORS.muted, marginTop: 4 },
  badge: {
    backgroundColor: '#E74C3C',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
