import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
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
  getAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { NOTIFICATION_CONFIG, formatTimeAgo } from '../../constants/notifications';
import { navigateFromNotification } from '../../utils/farmerNotificationNavigation';
import { useAuthStore } from '../../store/authStore';
import { useUnreadInboxCounts } from '../../hooks/useUnreadInboxCounts';
import { isSupportDeskUser } from '../../../shared/src/supportDesk';
import type { NotificationsStackParamList } from '../../navigation/types';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  context_type?: string | null;
  context_id?: string | null;
  action_url?: string | null;
};

type Nav = NativeStackNavigationProp<NotificationsStackParamList, 'NotificationsList'>;

const POLL_MS = 10000;

export function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.role === 'agent' || user?.role === 'field_officer';
  const isSupportDesk = isSupportDeskUser({
    userId: user?.userId,
    phoneNumber: user?.phoneNumber,
  });
  const { refresh: refreshUnreadCounts } = useUnreadInboxCounts();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAppNotifications(filter === 'unread');
      setNotifications(data.notifications ?? []);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load notifications'));
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

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        filter === 'unread'
          ? prev.filter((n) => n.id !== id)
          : prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      await refreshUnreadCounts();
    } catch {
      await load();
    }
  };

  const handleNotificationTap = async (item: NotificationRow) => {
    if (!item.is_read) {
      await handleMarkRead(item.id);
    } else {
      await refreshUnreadCounts();
    }
    navigateFromNotification(navigation, item, { isAgent, isSupportDesk });
  };

  const handleClearAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refreshUnreadCounts();
    } catch (err) {
      setError(extractApiError(err, 'Could not clear notifications'));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterBtn, filter === 'all' && styles.filterActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
          </Pressable>
          <Pressable
            style={[styles.filterBtn, filter === 'unread' && styles.filterActive]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
              Unread
            </Text>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={handleClearAll} style={styles.actionBtn}>
            <Text style={styles.actionText}>Clear all</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('NotificationSettings')}
            style={styles.settingsBtn}
            accessibilityLabel="Notification settings"
          >
            <Ionicons name="settings-outline" size={22} color={COLORS.primary} />
          </Pressable>
        </View>
      </View>

      {loading && notifications.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={COLORS.primary} />
      ) : error && notifications.length === 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          renderItem={({ item }) => {
            const config = NOTIFICATION_CONFIG[item.type] ?? NOTIFICATION_CONFIG.info;
            return (
              <Pressable
                style={[styles.card, !item.is_read && styles.unreadCard]}
                onPress={() => handleNotificationTap(item)}
              >
                <View style={styles.icon}>
                  <config.Icon size={22} color={config.color} />
                </View>
                <View style={styles.cardBody}>
                  <Text className="text-[#333333]" style={styles.cardTitle}>
                    {item.title || config.title}
                  </Text>
                  <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>
                  <Text style={styles.cardTime}>{formatTimeAgo(item.created_at)}</Text>
                  {(item.type === 'task_qc_failed' ||
                    item.context_type === 'farmer_task' ||
                    item.title?.toLowerCase().includes('qc')) && (
                    <Text style={styles.tapHint}>Tap to view task details →</Text>
                  )}
                  {(item.context_type === 'support_ticket' ||
                    item.type?.includes('support') ||
                    item.title?.toLowerCase().includes('support ticket') ||
                    item.title?.toLowerCase().includes('support replied')) && (
                    <Text style={styles.tapHint}>Tap to open support thread →</Text>
                  )}
                </View>
                {!item.is_read ? (
                  <Pressable
                    onPress={() => handleMarkRead(item.id)}
                    style={styles.markReadBtn}
                  >
                    <Text style={styles.markReadText}>Read</Text>
                  </Pressable>
                ) : null}
                {!item.is_read ? <View style={styles.unreadDot} /> : null}
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  filterTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBtn: { padding: 4 },
  actionText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  settingsBtn: { padding: 4 },
  loader: { marginTop: 40 },
  errorText: { color: '#c0392b', padding: 16, textAlign: 'center' },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ecea',
  },
  unreadCard: { borderColor: '#4472C4', backgroundColor: '#f8fbff' },
  icon: { marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4, color: COLORS.text },
  cardMessage: { fontSize: 13, color: '#444', lineHeight: 18 },
  cardTime: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
  tapHint: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 8,
    fontWeight: '600',
  },
  markReadBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  markReadText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
    marginLeft: 4,
    marginTop: 4,
  },
});
