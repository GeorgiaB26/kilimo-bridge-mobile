import React, { useMemo, type ComponentType } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Ban,
  Bell,
  CircleCheck,
  CircleX,
  Hourglass,
  TriangleAlert,
} from 'lucide-react-native';
import { KpiMetricCard } from './ui/KpiMetricCard';

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
  Icon: ComponentType<{ size?: number; color?: string }>;
  iconColor: string;
  countColor: string;
};

const BASE_KPI_CARDS: KpiCardDef[] = [
  {
    key: 'overdue',
    label: 'Overdue',
    Icon: TriangleAlert,
    iconColor: '#EF4444',
    countColor: '#EF4444',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    Icon: Hourglass,
    iconColor: '#2563EB',
    countColor: '#2563EB',
  },
  {
    key: 'not_started',
    label: 'Not started',
    Icon: Ban,
    iconColor: '#757575',
    countColor: '#333333',
  },
  {
    key: 'completed',
    label: 'Completed',
    Icon: CircleCheck,
    iconColor: '#10B981',
    countColor: '#10B981',
  },
];

const SUBMITTED_KPI: KpiCardDef = {
  key: 'submitted_for_approval',
  label: 'Submitted for approval',
  Icon: Bell,
  iconColor: '#2563EB',
  countColor: '#2563EB',
};

const REJECTED_KPI: KpiCardDef = {
  key: 'rejected',
  label: 'Rejected',
  Icon: CircleX,
  iconColor: '#D32F2F',
  countColor: '#D32F2F',
};

/** Columns per row for spacer alignment after chunking. */
export function kpiColumnsPerRow(cardCount: number): number {
  if (cardCount === 4) return 2;
  if (cardCount <= 3) return cardCount;
  return 3;
}

/**
 * Chunk visible KPIs into rows:
 * 4 → 2×2 (wider cards, squarer layout); 1–3 → one row; 5+ → wrap every 3.
 */
export function chunkKpiRows<T>(cards: T[]): T[][] {
  const n = cards.length;
  if (n === 0) return [];
  if (n === 4) return [cards.slice(0, 2), cards.slice(2, 4)];
  if (n <= 3) return [cards];
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
 * Status KPI cards shared by agent/farmer dashboards and Tasks screens.
 * Typography matches agent dashboard MetricCard (NativeWind text-2xl / text-xs).
 * SUBMITTED FOR APPROVAL and REJECTED are omitted when count is 0.
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
  const columnsPerRow = kpiColumnsPerRow(visibleCards.length);

  return (
    <View style={styles.kpiStack}>
      {rows.map((row, rowIndex) => (
        <View key={`kpi-row-${rowIndex}`} style={styles.kpiRow}>
          {row.map((kpi) => {
            const selectedCard = selected === kpi.key;
            const count = counts[kpi.key];
            const Icon = kpi.Icon;
            return (
              <KpiMetricCard
                key={kpi.key}
                label={kpi.label}
                value={count}
                Icon={Icon}
                iconColor={kpi.iconColor}
                countColor={kpi.countColor}
                selected={selectedCard}
                onPress={() => onSelect(kpi.key)}
                accessibilityLabel={`${kpi.label}: ${count}. ${
                  selectedCard ? 'Filter active, tap to show all tasks' : 'Tap to filter'
                }`}
              />
            );
          })}
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
  kpiSpacer: {
    flex: 1,
    minWidth: 0,
  },
});
