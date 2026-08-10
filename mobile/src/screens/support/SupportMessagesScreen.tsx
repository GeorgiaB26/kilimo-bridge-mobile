import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text as RNText,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import {
  listSupportTickets,
  type SupportTicketStatus,
  type SupportTicketSummary,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { formatTimeAgo } from '../../constants/notifications';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import type { SupportMessagesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SupportMessagesStackParamList, 'SupportTicketsList'>;
type Route = RouteProp<SupportMessagesStackParamList, 'SupportTicketsList'>;

type FilterKey = 'open' | 'resolved' | 'all';

const POLL_MS = 10000;

export function SupportMessagesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const initialFilter = (route.params?.statusFilter ?? 'open') as FilterKey;
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = route.params?.statusFilter;
    if (next === 'open' || next === 'resolved' || next === 'all') {
      setFilter(next);
    }
  }, [route.params?.statusFilter]);

  const load = useCallback(async () => {
    try {
      const status: SupportTicketStatus | undefined =
        filter === 'all' ? undefined : filter;
      const data = await listSupportTickets(status);
      setTickets(data.tickets ?? []);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load tickets'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

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

  const filters = useMemo(
    () =>
      [
        { key: 'open' as const, label: 'Open' },
        { key: 'resolved' as const, label: 'Resolved' },
        { key: 'all' as const, label: 'All' },
      ] as const,
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && tickets.length === 0 ? (
        <ActivityIndicator style={styles.loader} color="#1F4E78" />
      ) : error && tickets.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.thread_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={28} color={COLORS.muted} />
              <Text style={styles.empty}>
                {filter === 'open'
                  ? 'No open tickets. New Contact Support requests will show up here.'
                  : filter === 'resolved'
                    ? 'No resolved tickets yet.'
                    : 'No support tickets yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const resolved = item.status === 'resolved';
            return (
              <Pressable
                style={[styles.card, resolved && styles.cardResolved]}
                onPress={() =>
                  navigation.navigate('SupportTicketDetail', {
                    threadId: item.thread_id,
                    subject: item.subject,
                    status: item.status,
                  })
                }
              >
                <View style={styles.accent} />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.subject} numberOfLines={1}>
                      {item.subject}
                    </Text>
                    {item.last_message_at ? (
                      <Text style={styles.time}>{formatTimeAgo(item.last_message_at)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.metaRow}>
                    <KBStatusChip
                      label={resolved ? 'Resolved' : 'Open'}
                      variant={resolved ? 'success' : 'warning'}
                    />
                    <Text style={styles.requester} numberOfLines={1}>
                      {item.requester_name ?? 'Requester'}
                      {item.requester_role ? ` · ${item.requester_role}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.last_message_content ?? 'No messages yet'}
                  </Text>
                </View>
                {item.unread_count > 0 ? (
                  <View style={styles.badge}>
                    <RNText style={styles.badgeText} allowFontScaling={false}>
                      {item.unread_count > 99 ? '99+' : item.unread_count}
                    </RNText>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: '#1F4E78',
    borderColor: '#1F4E78',
  },
  filterText: { fontSize: 13, fontWeight: '600', color: '#333' },
  filterTextActive: { color: '#fff' },
  loader: { marginTop: 40 },
  errorBox: { padding: 16, alignItems: 'center' },
  error: { color: '#c0392b', textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#1F4E78',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 32, gap: 10 },
  empty: { textAlign: 'center', color: COLORS.muted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C5D7EB',
    overflow: 'hidden',
    paddingVertical: 12,
    paddingRight: 12,
  },
  cardResolved: {
    backgroundColor: '#fff',
    borderColor: '#e8ecea',
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#1F4E78',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  subject: { flex: 1, fontWeight: '700', fontSize: 15, color: '#111' },
  time: { fontSize: 12, color: COLORS.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  requester: { flex: 1, fontSize: 12, color: COLORS.muted },
  preview: { fontSize: 14, color: COLORS.muted, marginTop: 4 },
  badge: {
    backgroundColor: '#FFD700',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#1A1A1A',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    includeFontPadding: false,
  },
});
