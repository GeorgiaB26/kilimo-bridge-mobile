import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Button, FAB } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { getFarmerDashboard, claimPayment, getFarmerPayments } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { getLocalizedGreeting } from '../../utils/greeting';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { showMessage } from '../../utils/feedback';

export function FarmerDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<{
    farmer?: { name: string; country?: string };
    pendingAmount: number;
    totalEarnings: number;
    activeProjects: Array<{ project_name: string; completion_percentage: number; payment_amount: number }>;
    nextProject: { project_name: string; due_date: string } | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getFarmerDashboard();
      setData(result);
    } catch {
      // offline
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const payments = await getFarmerPayments();
      const pending = payments.payments?.find((p: { payment_status: string }) => p.payment_status === 'Pending');
      if (!pending) {
        showMessage('No payment ready', 'You have no payments ready to claim right now.');
        return;
      }
      const result = await claimPayment(pending.id);
      showMessage('Payment sent!', `${result.amount?.toLocaleString()} KES transferred.\nRef: ${result.reference}`);
      load();
    } catch {
      showMessage('Error', 'Could not claim payment. Is the backend running?');
    } finally {
      setClaiming(false);
    }
  };

  const country = data?.farmer?.country ?? 'Kenya';
  const greeting = getLocalizedGreeting(country, user?.name ?? 'Farmer');
  const pending = data?.pendingAmount ?? 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>{greeting.primary}</Text>
          <Text style={styles.greetingSub}>{greeting.secondary}</Text>
          <Text style={styles.heroSub}>Here&apos;s your earnings overview</Text>
        </View>

        <View style={styles.pendingCard}>
          <KBStatusChip label="Ready to Claim" variant="success" />
          <Text style={styles.pendingLabel}>Pending payment</Text>
          <Text style={styles.pendingAmount}>{pending.toLocaleString()} KES</Text>
          <Button
            mode="contained"
            onPress={handleClaim}
            loading={claiming}
            buttonColor={COLORS.accent}
            textColor={COLORS.primary}
            style={styles.claimBtn}
            contentStyle={{ minHeight: 48 }}
            icon="cash-fast"
          >
            Claim Now
          </Button>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Projects</Text>
            <Pressable onPress={onRefresh}>
              <Ionicons name="refresh" size={22} color={COLORS.primary} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
            {(data?.activeProjects ?? []).map((p, i) => (
              <View key={i} style={styles.projectCard}>
                <Ionicons name="leaf" size={28} color={COLORS.primary} />
                <Text style={styles.projectName}>{p.project_name}</Text>
                <Text style={styles.projectAmount}>{p.payment_amount?.toLocaleString()} KES</Text>
                <KBProgressBar progress={p.completion_percentage} />
              </View>
            ))}
            {(data?.activeProjects ?? []).length === 0 ? (
              <Text style={styles.empty}>No active projects yet</Text>
            ) : null}
          </ScrollView>
        </View>

        {data?.nextProject ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What&apos;s Next?</Text>
            <KBCard>
              <Text style={styles.nextName}>{data.nextProject.project_name}</Text>
              <Text style={styles.nextDue}>Due: {data.nextProject.due_date}</Text>
            </KBCard>
          </View>
        ) : null}

        <View style={styles.quickGrid}>
          <QuickAction icon="folder-open" label="Projects" />
          <QuickAction icon="wallet" label="Payments" />
          <QuickAction icon="help-circle" label="Support" />
        </View>

        <View style={styles.earningsFooter}>
          <Text style={styles.earningsLabel}>Total earned</Text>
          <Text style={styles.earningsValue}>{(data?.totalEarnings ?? 0).toLocaleString()} KES</Text>
        </View>
      </ScrollView>

      {pending > 0 ? (
        <FAB
          icon="cash"
          label="Claim"
          style={styles.fab}
          color={COLORS.primary}
          onPress={handleClaim}
          loading={claiming}
        />
      ) : null}
    </View>
  );
}

function QuickAction({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.quickItem}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={24} color={COLORS.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { flex: 1 },
  hero: {
    backgroundColor: COLORS.primary,
    padding: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  greetingSub: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
  pendingCard: {
    marginHorizontal: 16,
    marginTop: -24,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 24,
  },
  pendingLabel: { fontSize: 14, color: COLORS.muted, marginTop: 12 },
  pendingAmount: { fontSize: 36, fontWeight: '800', color: COLORS.accent, marginVertical: 8 },
  claimBtn: { width: '100%', borderRadius: 12, marginTop: 8 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  hScroll: { marginHorizontal: -4 },
  projectCard: {
    width: 200,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  projectName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 8 },
  projectAmount: { fontSize: 18, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  empty: { color: COLORS.muted, padding: 16 },
  nextName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  nextDue: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  quickGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginBottom: 24 },
  quickItem: { alignItems: 'center' },
  quickIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  earningsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 80,
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  earningsLabel: { fontSize: 16, color: COLORS.text },
  earningsValue: { fontSize: 20, fontWeight: '700', color: COLORS.accent },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: COLORS.accent },
});
