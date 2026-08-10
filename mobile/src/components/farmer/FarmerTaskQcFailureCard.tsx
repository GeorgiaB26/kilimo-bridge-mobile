import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';

/** Prominent QC failure block on farmer task detail (from notification deep-link). */
export function FarmerTaskQcFailureCard({ reason }: { reason: string }) {
  const trimmed = reason.trim();
  if (!trimmed) return null;

  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="alert-circle" size={22} color="#721c24" />
        <Text style={styles.title}>QC check failed</Text>
      </View>
      <Text style={styles.status}>FAILED</Text>
      <Text style={styles.reasonLabel}>Failure reason</Text>
      <Text style={styles.reason}>{trimmed}</Text>
      <Text style={styles.hint}>Review the feedback below and resubmit your evidence.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#721c24',
  },
  status: {
    fontSize: 16,
    fontWeight: '800',
    color: '#721c24',
    marginBottom: 8,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  reason: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  hint: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 10,
  },
});
