import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Button, FAB } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KilimoLogo } from '../../components/KilimoLogo';
import { FarmerLocationPrompt } from '../../components/FarmerLocationPrompt';
import { COLORS } from '../../constants';
import { getFarmerDashboard, claimPayment, getFarmerPayments, getFarmerHierarchyProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { useAuthStore } from '../../store/authStore';
import { getLocalizedGreeting, formatDueDate } from '../../utils/greeting';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';
import { showMessage } from '../../utils/feedback';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerTabParamList, FarmerProjectsStackParamList } from '../../navigation/types';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<FarmerTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<FarmerProjectsStackParamList>
>;

export function FarmerDashboardScreen() {
  const navigation = useNavigation<DashboardNav>();
  const user = useAuthStore((s) => s.user);
  const { formatAmount, formatPayment } = useCurrency();
  const [data, setData] = useState<{
    farmer?: { name: string; country?: string; profileLocationPending?: boolean };
    pendingAmount: number;
    totalEarnings: number;
    activeProjects: FarmerProject[];
    nextProject: FarmerProject | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getFarmerDashboard();
      setData(result);
      setError(null);
    } catch (err: unknown) {
      setData(null);
      setError(extractApiError(err, 'Backend offline or farmer account not linked'));
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
      showMessage('Payment sent!', `${formatAmount(result.amount)} transferred.\nRef: ${result.reference}`);
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
  const showLocationPrompt = Boolean(data?.farmer?.profileLocationPending);

  const openProjectDetail = async (project: FarmerProject) => {
    try {
      const data = await getFarmerHierarchyProjects();
      const hierarchy = data.projects ?? [];
      if (hierarchy.length > 0) {
        const hp = hierarchy[0];
        navigation.navigate('Projects', {
          screen: 'HierarchyProjectDetail',
          params: { projectId: hp.id, projectName: hp.name },
        });
        return;
      }
    } catch {
      // fall through to legacy detail
    }
    let programProjectId: string | undefined;
    try {
      const data = await getFarmerHierarchyProjects();
      programProjectId = data.projects?.[0]?.id;
    } catch {
      // tasks section will resolve on its own
    }
    navigation.navigate('Projects', {
      screen: 'ProjectDetail',
      params: { project, programProjectId },
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <KilimoLogo width={180} height={50} />
          </View>
          <Text style={styles.platformName}>Kilimo Bridge Platform</Text>
          <Text style={styles.greeting}>{greeting.primary}</Text>
          <Text style={styles.greetingSub}>{greeting.secondary}</Text>
          <Text style={styles.heroSub}>Here&apos;s your earnings overview</Text>
        </View>

        {error ? <FarmerOfflineBanner message={error} /> : null}

        <View style={styles.pendingCard}>
          <KBStatusChip label="Ready to Claim" variant="success" />
          <Text style={styles.pendingLabel}>Pending payment</Text>
          <Text style={styles.pendingAmount}>{formatAmount(pending)}</Text>
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
            {pending > 0 ? formatPayment(pending) : 'Claim Now'}
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
              <Pressable
                key={p.id ?? `${p.project_name}-${i}`}
                onPress={() => openProjectDetail(p)}
                style={styles.projectCard}
                accessibilityRole="button"
                accessibilityLabel={`View ${p.project_name} details`}
              >
                <View style={styles.projectCardHeader}>
                  <Ionicons name="leaf" size={24} color={COLORS.primary} />
                  <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                </View>
                <Text style={styles.projectName} numberOfLines={2}>{p.project_name}</Text>
                <Text style={styles.projectAmount}>{formatAmount(p.payment_amount)}</Text>
                <KBProgressBar
                  progress={p.completion_percentage}
                  label={`${p.completion_percentage}% done`}
                  rightLabel={p.due_date ? `Due ${formatDueDate(p.due_date)}` : undefined}
                  stacked
                />
              </Pressable>
            ))}
            {(data?.activeProjects ?? []).length === 0 ? (
              <Text style={styles.empty}>No active projects yet</Text>
            ) : null}
          </ScrollView>
        </View>

        {data?.nextProject ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What&apos;s Next?</Text>
            <Pressable onPress={() => openProjectDetail(data.nextProject!)} accessibilityRole="button">
              <KBCard>
                <View style={styles.nextRow}>
                  <View style={styles.nextText}>
                    <Text style={styles.nextName}>{data.nextProject.project_name}</Text>
                    <Text style={styles.nextDue}>
                      {data.nextProject.due_date
                        ? `Due: ${formatDueDate(data.nextProject.due_date)}`
                        : 'Tap for project details'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={COLORS.muted} />
                </View>
              </KBCard>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.earningsFooter}>
          <Text style={styles.earningsLabel}>Total earned</Text>
          <Text style={styles.earningsValue}>{formatAmount(data?.totalEarnings ?? 0)}</Text>
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
      <FarmerLocationPrompt
        country={country}
        visible={showLocationPrompt}
        onCompleted={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { flex: 1 },
  hero: {
    backgroundColor: COLORS.primary,
    padding: 24,
    paddingTop: 20,
    paddingBottom: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
  },
  logoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  platformName: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  greeting: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  greetingSub: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6, textAlign: 'center' },
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
    width: 228,
    minHeight: 176,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    paddingBottom: 20,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 8, lineHeight: 22 },
  projectAmount: { fontSize: 18, fontWeight: '700', color: COLORS.accent, marginTop: 4, marginBottom: 2 },
  empty: { color: COLORS.muted, padding: 16 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  nextText: { flex: 1 },
  nextName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  nextDue: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
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
