import React, { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ChartColumn, CircleCheck, Hourglass, MailOpen } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '../../store/authStore';
import { getSupportStats, type SupportTicketStats } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import type { SupportTabParamList } from '../../navigation/types';

type Nav = BottomTabNavigationProp<SupportTabParamList, 'Dashboard'>;

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

function MetricCard({
  Icon,
  iconColor,
  label,
  value,
  color,
  onPress,
}: {
  Icon: ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  label: string;
  value: number;
  color?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.metricCard}>
      <Icon size={20} color={iconColor ?? '#757575'} />
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.metricPressable, webPressable]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.metricPressable}>{inner}</View>;
}

export function SupportDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<SupportTicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getSupportStats();
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setStats(null);
      setError(extractApiError(err, 'Could not load support stats'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 30000);
      return () => clearInterval(timer);
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openInbox = (statusFilter: 'open' | 'resolved' | 'all') => {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'Messages',
        params: {
          screen: 'SupportTicketsList',
          params: { statusFilter },
        },
      })
    );
  };

  if (loading && !stats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#1F4E78" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] ?? 'Support'}</Text>
      <Text style={styles.subtitle}>Ticket desk overview</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
        <MetricCard
          Icon={Hourglass}
          iconColor="#E67E22"
          label="Unresolved, ongoing"
          value={stats?.open ?? 0}
          color="#E67E22"
          onPress={() => openInbox('open')}
        />
        <MetricCard
          Icon={MailOpen}
          iconColor="#1F4E78"
          label="Not started"
          value={stats?.unread_open ?? 0}
          color="#1F4E78"
          onPress={() => openInbox('open')}
        />
      </View>
      <View style={styles.row}>
        <MetricCard
          Icon={CircleCheck}
          iconColor="#2E7D5E"
          label="Resolved"
          value={stats?.resolved ?? 0}
          color="#2E7D5E"
          onPress={() => openInbox('resolved')}
        />
        <MetricCard
          Icon={ChartColumn}
          iconColor="#757575"
          label="Total"
          value={stats?.total ?? 0}
          onPress={() => openInbox('all')}
        />
      </View>

      {(stats?.total ?? 0) === 0 && !error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No tickets yet</Text>
          <Text style={styles.emptyBody}>
            When farmers or field agents submit Contact Support, open tickets appear here and in the
            Messages inbox.
          </Text>
        </View>
      ) : null}

      <Pressable style={[styles.inboxBtn, webPressable]} onPress={() => openInbox('open')}>
        <Text className="text-[15px] font-bold text-white">Open ticket inbox</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7f6' },
  greeting: { fontSize: 22, fontWeight: '700', color: '#1F4E78' },
  subtitle: { fontSize: 14, color: '#757575', marginBottom: 16, marginTop: 4 },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  error: { color: '#c0392b' },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#1F4E78',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ecea',
    padding: 16,
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1F4E78', marginBottom: 6 },
  emptyBody: { fontSize: 14, color: '#757575', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricPressable: { flex: 1 },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#fff',
    padding: 14,
  },
  metricValue: { marginTop: 6, fontSize: 28, fontWeight: '700', color: '#333' },
  metricLabel: { marginTop: 2, fontSize: 12, color: '#757575', lineHeight: 16 },
  inboxBtn: {
    marginTop: 12,
    backgroundColor: '#1F4E78',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
