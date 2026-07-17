import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { useCurrency } from '../../context/CurrencyContext';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerProjectTasksSection } from '../../components/farmer/FarmerProjectTasksSection';
import { formatDueDate, formatProjectStatus } from '../../utils/greeting';
import { PROJECT_DESCRIPTIONS } from '../../types/farmerProject';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FarmerProjectsStackParamList, 'ProjectDetail'>;

export function FarmerProjectDetailScreen({ route }: Props) {
  const { project, programProjectId } = route.params;
  const { formatAmount } = useCurrency();
  const statusInfo = formatProjectStatus(project.status);
  const isComplete = project.status === 'Completed';
  const description =
    PROJECT_DESCRIPTIONS[project.project_name] ??
    'A Kilimo Bridge cooperative project. Complete the assigned work to receive your payment via M-Pesa.';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="leaf" size={36} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{project.project_name}</Text>
        <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>About this project</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Payment</Text>
        <Text style={styles.amount}>{formatAmount(project.payment_amount)}</Text>
        {project.payment_status ? (
          <Text style={styles.meta}>Payment status: {project.payment_status}</Text>
        ) : null}
      </View>

      {!isComplete ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Your progress</Text>
          <KBProgressBar
            progress={project.completion_percentage}
            label={`${project.completion_percentage}% complete`}
            rightLabel={project.due_date ? `Due ${formatDueDate(project.due_date)}` : undefined}
            stacked
          />
        </View>
      ) : null}

      <View style={styles.tasksCard}>
        <FarmerProjectTasksSection programProjectId={programProjectId} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E8F5F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.primary, textAlign: 'center', marginBottom: 12 },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
  },
  tasksCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  description: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  amount: { fontSize: 32, fontWeight: '800', color: COLORS.accent, lineHeight: 40 },
  meta: { fontSize: 14, lineHeight: 22, color: COLORS.muted, marginTop: 10 },
});
