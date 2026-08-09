import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Text } from '@/components/ui/text';

export type TaskStatusKpiKey =
  | 'overdue'
  | 'in_progress'
  | 'not_started'
  | 'submitted_for_approval'
  | 'rejected'
  | 'completed';

type KpiCardDef = {
  key: TaskStatusKpiKey;
  label: string;
  badgeBg: string;
  countColor: string;
};

const BASE_KPI_CARDS: KpiCardDef[] = [
  { key: 'overdue', label: 'OVERDUE', badgeBg: '#FFEBEE', countColor: '#C62828' },
  { key: 'in_progress', label: 'IN PROGRESS', badgeBg: '#FFF3E0', countColor: '#EF6C00' },
  { key: 'not_started', label: 'NOT STARTED', badgeBg: '#F5F5F5', countColor: '#37474F' },
  { key: 'completed', label: 'COMPLETED', badgeBg: '#E8F5E9', countColor: '#2E7D32' },
];

const SUBMITTED_KPI: KpiCardDef = {
  key: 'submitted_for_approval',
  label: 'SUBMITTED FOR APPROVAL',
  badgeBg: '#E3F2FD',
  countColor: '#1565C0',
};

const REJECTED_KPI: KpiCardDef = {
  key: 'rejected',
  label: 'REJECTED',
  badgeBg: '#FFEBEE',
  countColor: '#C62828',
};

/**
 * Chunk visible KPIs into rows:
 * 1–4 → one row; 5 → 3+2; 6 → 3+3; more → wrap every 3.
 */
export function chunkKpiRows<T>(cards: T[]): T[][] {
  const n = cards.length;
  if (n <= 4) return n === 0 ? [] : [cards];
  const rows: T[][] = [];
  for (let i = 0; i < n; i += 3) {
    rows.push(cards.slice(i, i + 3));
  }
  return rows;
}

type Props = {
  counts: Record<TaskStatusKpiKey, number>;
  /** Active filter key, or null/undefined when showing all. */
  selected?: TaskStatusKpiKey | null;
  onSelect: (key: TaskStatusKpiKey) => void;
};

/**
 * Status KPI cards for Tasks screens.
 * SUBMITTED FOR APPROVAL and REJECTED are omitted when count is 0.
 * Layout wraps by visible count: 4 on one line; 5 → 3+2; 6 → 3+3.
 * Labels are a fixed 10px and may wrap; cards in a row stretch to equal height.
 */
export function TaskStatusKpiRow({ counts, selected, onSelect }: Props) {
  const visibleCards = useMemo(() => {
    const cards = [...BASE_KPI_CARDS];
    if (counts.submitted_for_approval > 0) {
      const completedIdx = cards.findIndex((c) => c.key === 'completed');
      cards.splice(completedIdx, 0, SUBMITTED_KPI);
    }
    if (counts.rejected > 0) {
      cards.push(REJECTED_KPI);
    }
    return cards;
  }, [counts.rejected, counts.submitted_for_approval]);

  const rows = useMemo(() => chunkKpiRows(visibleCards), [visibleCards]);
  const columnsPerRow = visibleCards.length <= 4 ? visibleCards.length : 3;

  return (
    <View style={styles.kpiStack}>
      {rows.map((row, rowIndex) => (
        <View key={`kpi-row-${rowIndex}`} style={styles.kpiRow}>
          {row.map((kpi) => {
            const selectedCard = selected === kpi.key;
            const count = counts[kpi.key];
            return (
              <Pressable
                key={kpi.key}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCard }}
                accessibilityLabel={`${kpi.label}: ${count}. ${
                  selectedCard ? 'Filter active, tap to show all tasks' : 'Tap to filter'
                }`}
                onPress={() => onSelect(kpi.key)}
                style={[
                  styles.kpiCard,
                  selectedCard ? styles.kpiCardSelected : null,
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                ]}
              >
                <Text style={styles.kpiLabel} allowFontScaling={false}>
                  {kpi.label}
                </Text>
                <View style={[styles.kpiBadge, { backgroundColor: kpi.badgeBg }]}>
                  <Text style={[styles.kpiCount, { color: kpi.countColor }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
          {/* Keep card widths aligned when the last row is shorter (e.g. 3+2). */}
          {row.length < columnsPerRow
            ? Array.from({ length: columnsPerRow - row.length }).map((_, i) => (
                <View key={`kpi-spacer-${rowIndex}-${i}`} style={styles.kpiSpacer} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiStack: {
    marginTop: 12,
    gap: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiSpacer: {
    flex: 1,
    minWidth: 0,
  },
  kpiCardSelected: {
    borderColor: '#1A4D3E',
    borderWidth: 2,
  },
  kpiLabel: {
    width: '100%',
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  kpiBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiCount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
