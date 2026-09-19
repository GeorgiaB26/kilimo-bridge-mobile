import React, { useState } from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { ChevronRight, LogOut, MessageCircle, UserRoundPen } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { formatProjectDate } from '../../utils/greeting';
import type { FarmerProject } from '../../types/farmerProject';
import { FarmerProfilePhoto } from '../FarmerProfilePhoto';
import { FarmerStatusChip } from '../agent/FarmerStatusChip';
import { ContactSupportModal } from '../ContactSupportModal';
import { KBCard } from '../ui/KBCard';
import {
  TaskStatusKpiRow,
  type TaskStatusKpiKey,
} from '../TaskStatusKpiRow';

type FarmerProfile = {
  name?: string;
  country?: string;
  district?: string;
  region?: string;
  status?: string;
  picture_url?: string | null;
  pending_picture_url?: string | null;
  photoUpdatePending?: boolean;
};

type PaymentSummary = {
  total: number;
  transferred: number;
  pending: number;
  completed?: number;
  allPayments?: number;
};

type TaskStats = {
  overdue: number;
  in_progress?: number;
  not_started?: number;
  submitted_for_approval?: number;
  rejected?: number;
  completed?: number;
  total?: number;
};

type RecentTaskRow = {
  id: string;
  name: string;
  due_date?: string | null;
  assigned_by_name?: string;
  program_project_name?: string;
  status?: string;
};

type PaymentRow = {
  id: string;
  project_name?: string;
  task_name?: string;
  amount: number;
  payment_status: string;
  created_at?: string;
};

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

const PROFILE_BODY_BG = '#F5F5F5';
const PROFILE_COVER_HEIGHT = 168;
const PROFILE_AVATAR_SIZE = 100;
const PROFILE_AVATAR_OVERLAP = PROFILE_AVATAR_SIZE / 2;
/** Pull profile details up over the cover fade without moving the cover image. */
const PROFILE_BODY_LIFT = 53;

type Props = {
  farmer?: FarmerProfile | null;
  paymentSummary?: PaymentSummary | null;
  taskStats?: TaskStats | null;
  recentProjects?: FarmerProject[];
  recentPayments?: PaymentRow[];
  formatAmount: (n: number) => string;
  currencyLabel?: string;
  onEditProfile: () => void;
  onLogout: () => void;
  onPaymentsPress: () => void;
  onTasksPress: (filter?: 'overdue' | 'in_progress' | 'not_started' | 'completed') => void;
  onProjectPress: (project: FarmerProject) => void;
};

export function FarmerDashboardProfileCard({
  farmer,
  currencyLabel,
  onEditProfile,
  onLogout,
}: Pick<Props, 'farmer' | 'currencyLabel' | 'onEditProfile' | 'onLogout'>) {
  const name = farmer?.name ?? 'Farmer';
  const location = farmer?.district || farmer?.region || farmer?.country || 'Kenya';
  const { width: coverWidth } = useWindowDimensions();

  return (
    <View style={styles.profileSection}>
      <View style={styles.profileCover} accessibilityLabel="Profile cover">
        <Image
          source={require('../../../assets/farmer-profile-cover.jpg')}
          style={styles.profileCoverImage}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <Svg
          width={coverWidth}
          height={PROFILE_COVER_HEIGHT}
          style={styles.profileCoverFade}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="farmerProfileCoverTopDim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.4} />
              <Stop offset="0.35" stopColor="#000000" stopOpacity={0.32} />
              <Stop offset="0.55" stopColor="#000000" stopOpacity={0.14} />
              <Stop offset="0.72" stopColor="#000000" stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="farmerProfileCoverFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PROFILE_BODY_BG} stopOpacity={0} />
              <Stop offset="0.5" stopColor={PROFILE_BODY_BG} stopOpacity={0} />
              <Stop offset="1" stopColor={PROFILE_BODY_BG} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={coverWidth}
            height={PROFILE_COVER_HEIGHT}
            fill="url(#farmerProfileCoverTopDim)"
          />
          <Rect
            x={0}
            y={0}
            width={coverWidth}
            height={PROFILE_COVER_HEIGHT}
            fill="url(#farmerProfileCoverFade)"
          />
        </Svg>
      </View>
      <View style={styles.profileBody}>
        <View style={[styles.profileBodyContent, { marginTop: -PROFILE_BODY_LIFT }]}>
          <View style={[styles.profileAvatarWrap, { marginTop: -PROFILE_AVATAR_OVERLAP }]}>
            <View style={styles.profileAvatarRing}>
              <View style={styles.profileAvatarClip}>
                <FarmerProfilePhoto
                  name={name}
                  pictureUrl={farmer?.picture_url}
                  size="large"
                  variant="header"
                />
              </View>
            </View>
          </View>

          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileLocation}>{location}</Text>

          <View style={styles.statusBlock}>
            <FarmerStatusChip status={farmer?.status} micro centered />
          </View>

          <Text style={styles.currencyText}>
            {currencyLabel ?? 'Kenyan Shilling (KES)'}
          </Text>

          <View style={styles.profileActions}>
            <Pressable
              style={[styles.profileActionButton, webPressable]}
              onPress={onEditProfile}
              accessibilityRole="button"
            >
              <UserRoundPen size={16} color="#333333" strokeWidth={2.25} />
              <Text style={styles.profileActionButtonText}>Edit Profile</Text>
            </Pressable>
            <Pressable
              style={[styles.profileActionButton, styles.profileLogoutButton, webPressable]}
              onPress={onLogout}
              accessibilityRole="button"
            >
              <LogOut size={16} color="#FFFFFF" strokeWidth={2.25} />
              <Text style={[styles.profileActionButtonText, styles.profileLogoutButtonText]}>
                Logout
              </Text>
            </Pressable>
          </View>

          {farmer?.pending_picture_url || farmer?.photoUpdatePending ? (
            <Text style={styles.pendingPhotoNote}>
              New photo sent — waiting for your field agent to approve it.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function FarmerDashboardEarningsCard({
  paymentSummary,
  formatAmount,
  onPress,
}: {
  paymentSummary?: PaymentSummary | null;
  formatAmount: (n: number) => string;
  onPress: () => void;
}) {
  const total = paymentSummary?.allPayments ?? paymentSummary?.total ?? 0;
  const completed = paymentSummary?.completed ?? paymentSummary?.transferred ?? 0;
  const pending = paymentSummary?.pending ?? 0;

  return (
    <Pressable style={styles.earningsCard} onPress={onPress}>
      <Text style={styles.earningsLabel}>Total Earnings to Date</Text>
      <Text style={styles.earningsAmount}>{formatAmount(total)}</Text>
      <View style={styles.earningsBreakdown}>
        <View style={styles.earningsStat}>
          <Text style={styles.earningsStatLabel}>Completed</Text>
          <Text style={styles.earningsStatValue}>{formatAmount(completed)}</Text>
        </View>
        <View style={styles.earningsDivider} />
        <View style={styles.earningsStat}>
          <Text style={styles.earningsStatLabel}>Pending</Text>
          <Text style={styles.earningsStatValue}>{formatAmount(pending)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function FarmerDashboardTaskSnapshots({
  taskStats,
  onTasksPress,
}: {
  taskStats?: TaskStats | null;
  onTasksPress: (filter?: TaskStatusKpiKey) => void;
}) {
  const counts: Record<TaskStatusKpiKey, number> = {
    overdue: taskStats?.overdue ?? 0,
    in_progress: taskStats?.in_progress ?? 0,
    not_started: taskStats?.not_started ?? 0,
    submitted_for_approval: taskStats?.submitted_for_approval ?? 0,
    rejected: taskStats?.rejected ?? 0,
    completed: taskStats?.completed ?? 0,
  };

  return (
    <View style={styles.snapshotsContainer}>
      <Text style={styles.snapshotsTitle}>Task summary</Text>

      <TaskStatusKpiRow
        counts={counts}
        selected={null}
        onSelect={(key) => onTasksPress(key)}
      />

      <Pressable style={styles.viewAllTasks} onPress={() => onTasksPress()}>
        <Text style={styles.viewAllTasksText}>View all tasks →</Text>
      </Pressable>
    </View>
  );
}

export function FarmerDashboardRecentTasks({
  tasks,
  onTasksPress,
  onTaskPress,
}: {
  tasks?: RecentTaskRow[] | null;
  onTasksPress: () => void;
  onTaskPress?: (taskId: string) => void;
}) {
  const recent = (tasks ?? []).slice(0, 5);

  return (
    <KBCard style={{ marginHorizontal: 12 }}>
      <Pressable
        onPress={onTasksPress}
        className="flex-row items-center justify-between"
        style={webPressable}
      >
        <Text className="text-sm font-bold text-[#333333]">Recent tasks</Text>
        <ChevronRight size={16} color="#1A4D3E" />
      </Pressable>
      {recent.length > 0 ? (
        recent.map((task) => (
          <Pressable
            key={task.id}
            onPress={() => (onTaskPress ? onTaskPress(task.id) : onTasksPress())}
            className="mt-2 border-t border-[#EEE] pt-2"
            style={webPressable}
          >
            <Text className="text-sm font-semibold text-[#333333]">{task.name}</Text>
            <Text className="text-xs text-[#757575]">
              {task.assigned_by_name ?? 'Program team'}
              {task.due_date ? ` · Due ${formatProjectDate(task.due_date)}` : ''}
            </Text>
            {task.program_project_name ? (
              <Text className="text-xs text-[#757575]">{task.program_project_name}</Text>
            ) : null}
          </Pressable>
        ))
      ) : (
        <Text className="mt-2 text-sm text-[#757575]">No tasks assigned yet.</Text>
      )}
    </KBCard>
  );
}

export function FarmerDashboardRecentProjects({
  projects,
  formatAmount,
  onProjectPress,
  onProjectsPress,
}: {
  projects: FarmerProject[];
  formatAmount: (n: number) => string;
  onProjectPress: (project: FarmerProject) => void;
  onProjectsPress: () => void;
}) {
  const recent = projects.slice(0, 5);

  return (
    <KBCard style={{ marginHorizontal: 12 }}>
      <Pressable
        onPress={onProjectsPress}
        className="flex-row items-center justify-between"
        style={webPressable}
      >
        <Text className="text-sm font-bold text-[#333333]">
          Recent projects ({projects.length})
        </Text>
        <ChevronRight size={16} color="#1A4D3E" />
      </Pressable>
      {recent.length > 0 ? (
        recent.map((p, i) => (
          <Pressable
            key={p.id ?? `${p.project_name}-${i}`}
            onPress={() => onProjectPress(p)}
            className="mt-2 border-t border-[#EEE] pt-2"
            style={webPressable}
          >
            <Text className="text-sm font-semibold text-[#333333]" numberOfLines={2}>
              {p.project_name}
            </Text>
            <Text className="text-xs text-[#757575]">
              {p.start_date || p.due_date
                ? `${p.start_date ? `Start ${formatProjectDate(p.start_date)}` : ''}${
                    p.start_date && p.due_date ? ' · ' : ''
                  }${p.due_date ? `End ${formatProjectDate(p.due_date)}` : ''}`
                : p.status ?? 'Active'}
              {` · ${formatAmount(p.payment_amount)}`}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text className="mt-2 text-sm text-[#757575]">No active projects yet.</Text>
      )}
    </KBCard>
  );
}

export function FarmerDashboardRecentPayments({
  payments,
  formatAmount,
  onPress,
}: {
  payments: PaymentRow[];
  formatAmount: (n: number) => string;
  onPress: () => void;
}) {
  if (payments.length === 0) {
    return <Text style={styles.emptyText}>No payments yet.</Text>;
  }

  return (
    <>
      {payments.slice(0, 3).map((p) => (
        <Pressable key={p.id} style={styles.recentCard} onPress={onPress}>
          <View style={styles.recentRow}>
            <Text style={styles.recentTitle} numberOfLines={1}>
              {p.project_name ?? 'Payment'}
            </Text>
            <Text style={styles.recentAmount}>{formatAmount(p.amount)}</Text>
          </View>
          <Text style={styles.recentMeta}>
            {p.task_name && p.task_name !== p.project_name ? `${p.task_name} · ` : ''}
            {p.payment_status}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

export function FarmerDashboardSupportSection(_props: {
  farmerName?: string;
  farmerPhone?: string;
} = {}) {
  const navigation = useNavigation();
  const [supportOpen, setSupportOpen] = useState(false);

  const openCreatedTicket = (threadId: string) => {
    // Stay on the farmer shell — open Messages with list under the new thread
    // so Back returns to the inbox (not a different account / tab).
    navigation.dispatch(
      CommonActions.navigate({
        name: 'MessagesFlow',
        params: {
          state: {
            routes: [
              { name: 'MessagesList' },
              {
                name: 'MessageDetail',
                params: {
                  threadId,
                  contextType: 'support_ticket',
                  supportStatus: 'open',
                },
              },
            ],
            index: 1,
          },
        },
      })
    );
  };

  return (
    <View style={styles.supportSection}>
      <Pressable
        style={[styles.supportButton, webPressable]}
        onPress={() => setSupportOpen(true)}
        accessibilityRole="button"
      >
        <MessageCircle size={16} color="#333333" strokeWidth={2.25} />
        <Text style={styles.supportButtonText}>Contact Support</Text>
      </Pressable>
      <ContactSupportModal
        visible={supportOpen}
        onClose={() => setSupportOpen(false)}
        onCreated={openCreatedTicket}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  profileSection: {
    marginBottom: 4,
    backgroundColor: PROFILE_BODY_BG,
  },
  profileCover: {
    height: PROFILE_COVER_HEIGHT,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: PROFILE_BODY_BG,
  },
  profileCoverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  profileCoverFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  profileBody: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: PROFILE_BODY_BG,
  },
  profileBodyContent: {
    width: '100%',
    alignItems: 'center',
  },
  profileAvatarWrap: {
    alignItems: 'center',
    zIndex: 2,
  },
  profileAvatarRing: {
    width: PROFILE_AVATAR_SIZE + 8,
    height: PROFILE_AVATAR_SIZE + 8,
    borderRadius: (PROFILE_AVATAR_SIZE + 8) / 2,
    padding: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  profileAvatarClip: {
    width: PROFILE_AVATAR_SIZE,
    height: PROFILE_AVATAR_SIZE,
    borderRadius: PROFILE_AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: PROFILE_BODY_BG,
  },
  profileName: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  profileLocation: {
    marginTop: 4,
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
  },
  statusBlock: {
    marginTop: 4,
    alignItems: 'center',
  },
  currencyText: {
    marginTop: 4,
    marginBottom: 18,
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
    textAlign: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 360,
  },
  pendingPhotoNote: {
    marginTop: 14,
    fontSize: 12,
    textAlign: 'center',
    color: '#B45309',
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  profileActionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
  },
  profileActionButtonText: {
    color: '#333333',
    fontWeight: '600',
    fontSize: 14,
  },
  profileLogoutButton: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  profileLogoutButtonText: {
    color: '#FFFFFF',
  },
  earningsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  earningsAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F4E78',
    marginBottom: 12,
    textAlign: 'center',
  },
  earningsBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  earningsStat: { alignItems: 'center', flex: 1 },
  earningsDivider: {
    width: 1,
    backgroundColor: '#eee',
    marginHorizontal: 8,
  },
  earningsStatLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  earningsStatValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F4E78',
  },
  snapshotsContainer: {
    paddingHorizontal: 12,
    marginVertical: 8,
  },
  snapshotsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F4E78',
    marginBottom: 0,
  },
  snapshotCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  overdueCard: {
    backgroundColor: '#FFE5E5',
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
  },
  upcomingCard: {
    backgroundColor: '#E8F4FD',
    borderLeftWidth: 4,
    borderLeftColor: '#4472C4',
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  snapshotGridItem: {
    width: '47%',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  snapshotGridCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F4E78',
    marginBottom: 4,
  },
  snapshotGridLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  inProgressCard: {
    backgroundColor: '#E8F0FE',
    borderColor: '#2563EB',
  },
  notStartedCard: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  completedCard: {
    backgroundColor: '#E8F8F0',
    borderColor: '#10B981',
  },
  snapshotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snapshotBadge: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  snapshotCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F4E78',
  },
  snapshotText: { flex: 1 },
  snapshotLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F4E78',
    marginBottom: 2,
  },
  snapshotDescription: { fontSize: 12, color: '#666' },
  snapshotArrow: { fontSize: 18, color: '#999', marginLeft: 8 },
  viewAllTasks: { alignItems: 'center', paddingVertical: 12 },
  viewAllTasksText: {
    fontSize: 14,
    color: '#4472C4',
    fontWeight: '600',
  },
  recentSection: {
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recentTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  recentMeta: { fontSize: 12, color: '#757575', marginTop: 4 },
  recentAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF6A',
  },
  emptyText: { color: '#757575', fontSize: 14 },
  supportSection: {
    paddingHorizontal: 12,
    marginVertical: 16,
    gap: 12,
  },
  supportButton: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
  },
  supportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
});
