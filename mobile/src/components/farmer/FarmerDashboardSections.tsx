import React from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { formatProjectDate } from '../../utils/greeting';
import type { FarmerProject } from '../../types/farmerProject';

type FarmerProfile = {
  name?: string;
  country?: string;
  district?: string;
  region?: string;
  status?: string;
  picture_url?: string | null;
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
  upcoming: number;
};

type PaymentRow = {
  id: string;
  project_name?: string;
  amount: number;
  payment_status: string;
  created_at?: string;
};

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
  onTasksPress: (filter?: 'overdue' | 'upcoming') => void;
  onProjectPress: (project: FarmerProject) => void;
};

function isVerified(status?: string): boolean {
  const s = (status ?? '').toLowerCase().replace(/\s+/g, '_');
  return s === 'verified' || s === 'active';
}

export function FarmerDashboardProfileCard({
  farmer,
  currencyLabel,
  onEditProfile,
  onLogout,
}: Pick<Props, 'farmer' | 'currencyLabel' | 'onEditProfile' | 'onLogout'>) {
  const name = farmer?.name ?? 'Farmer';
  const location = farmer?.district || farmer?.region || farmer?.country || 'Kenya';
  const verified = isVerified(farmer?.status);

  return (
    <View style={styles.profileContainer}>
      <View style={styles.photoContainer}>
        {farmer?.picture_url ? (
          <Image source={{ uri: farmer.picture_url }} style={styles.profilePhoto} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoInitials}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.profileName}>{name}</Text>
      <Text style={styles.profileLocation}>{location}</Text>
      {verified ? (
        <View style={styles.verificationBadge}>
          <Text style={styles.verificationText}>✓ Verified</Text>
        </View>
      ) : null}
      <Text style={styles.statusText}>
        {verified ? 'Verified and approved' : 'Profile under review'}
      </Text>
      <Text style={styles.currencyText}>{currencyLabel ?? 'Kenyan Shilling (KES)'}</Text>
      <View style={styles.profileActions}>
        <Pressable style={styles.editButton} onPress={onEditProfile}>
          <Text style={styles.buttonText}>Edit Profile</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
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
  onTasksPress: (filter?: 'overdue' | 'upcoming') => void;
}) {
  const overdue = taskStats?.overdue ?? 0;
  const upcoming = taskStats?.upcoming ?? 0;

  return (
    <View style={styles.snapshotsContainer}>
      <Text style={styles.snapshotsTitle}>Task Summary</Text>

      <Pressable
        style={[styles.snapshotCard, styles.overdueCard]}
        onPress={() => onTasksPress('overdue')}
      >
        <View style={styles.snapshotContent}>
          <View style={styles.snapshotBadge}>
            <Text style={styles.snapshotCount}>{overdue}</Text>
          </View>
          <View style={styles.snapshotText}>
            <Text style={styles.snapshotLabel}>Overdue Tasks</Text>
            <Text style={styles.snapshotDescription}>
              {overdue} need attention
            </Text>
          </View>
          <Text style={styles.snapshotArrow}>→</Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.snapshotCard, styles.upcomingCard]}
        onPress={() => onTasksPress('upcoming')}
      >
        <View style={styles.snapshotContent}>
          <View style={styles.snapshotBadge}>
            <Text style={styles.snapshotCount}>{upcoming}</Text>
          </View>
          <View style={styles.snapshotText}>
            <Text style={styles.snapshotLabel}>Upcoming This Week</Text>
            <Text style={styles.snapshotDescription}>
              {upcoming} due soon
            </Text>
          </View>
          <Text style={styles.snapshotArrow}>→</Text>
        </View>
      </Pressable>

      <Pressable style={styles.viewAllTasks} onPress={() => onTasksPress()}>
        <Text style={styles.viewAllTasksText}>View All Tasks →</Text>
      </Pressable>
    </View>
  );
}

export function FarmerDashboardRecentProjects({
  projects,
  formatAmount,
  onProjectPress,
}: {
  projects: FarmerProject[];
  formatAmount: (n: number) => string;
  onProjectPress: (project: FarmerProject) => void;
}) {
  if (projects.length === 0) {
    return <Text style={styles.emptyText}>No active projects yet.</Text>;
  }

  return (
    <>
      {projects.slice(0, 3).map((p, i) => (
        <Pressable
          key={p.id ?? `${p.project_name}-${i}`}
          style={styles.recentCard}
          onPress={() => onProjectPress(p)}
        >
          <View style={styles.recentRow}>
            <Text style={styles.recentTitle} numberOfLines={2}>{p.project_name}</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </View>
          {p.start_date || p.due_date ? (
            <Text style={styles.recentMeta}>
              {p.start_date ? `Start: ${formatProjectDate(p.start_date)}` : ''}
              {p.start_date && p.due_date ? ' · ' : ''}
              {p.due_date ? `End: ${formatProjectDate(p.due_date)}` : ''}
            </Text>
          ) : null}
          <Text style={styles.recentAmount}>{formatAmount(p.payment_amount)}</Text>
        </Pressable>
      ))}
    </>
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
          <Text style={styles.recentMeta}>{p.payment_status}</Text>
        </Pressable>
      ))}
    </>
  );
}

export function FarmerDashboardSupportSection() {
  const supportPhone = '+254700000000';

  return (
    <View style={styles.supportSection}>
      <Pressable
        style={styles.supportButton}
        onPress={() => Linking.openURL(`tel:${supportPhone}`)}
      >
        <Text style={styles.supportButtonText}>📞 Contact Support</Text>
      </Pressable>
      <Pressable
        style={styles.supportButton}
        onPress={() => Linking.openURL('https://kilimobridge.com/faq')}
      >
        <Text style={styles.supportButtonText}>❓ FAQ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  profileContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#2d5a4a',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  photoContainer: { marginBottom: 16 },
  profilePhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  photoInitials: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  profileLocation: {
    fontSize: 14,
    color: '#e0e0e0',
    marginBottom: 12,
    textAlign: 'center',
  },
  verificationBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  verificationText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  statusText: {
    fontSize: 14,
    color: '#e0e0e0',
    marginBottom: 4,
    textAlign: 'center',
  },
  currencyText: {
    fontSize: 14,
    color: '#FFB800',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  editButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  logoutButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  logoutButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  earningsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    fontWeight: '500',
  },
  earningsAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F4E78',
    marginBottom: 12,
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
    marginBottom: 12,
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
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  supportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F4E78',
  },
});
