import React, { useCallback, useMemo, useState } from 'react';
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

const KPI_LABEL_MAX_FONT = 10;
const KPI_LABEL_MIN_FONT = 5.5;
const KPI_LABEL_CHAR_WIDTH = 0.72;

function kpiLabelFontSizeForWidth(labelWidth: number, labels: string[]): number {
  if (labelWidth <= 0) return KPI_LABEL_MAX_FONT;
  const longest = Math.max(1, ...labels.map((l) => l.length));
  const letterSpacing = 0.15;
  let size = KPI_LABEL_MAX_FONT;
  while (size > KPI_LABEL_MIN_FONT) {
    const estimated =
      longest * size * KPI_LABEL_CHAR_WIDTH + Math.max(0, longest - 1) * letterSpacing;
    if (estimated <= labelWidth) return Math.round(size * 10) / 10;
    size -= 0.25;
  }
  return KPI_LABEL_MIN_FONT;
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
 */
export function TaskStatusKpiRow({ counts, selected, onSelect }: Props) {
  const [kpiLabelWidth, setKpiLabelWidth] = useState(0);

  const visibleCards = useMemo(() => {
    const cards = [...BASE_KPI_CARDS];
    if (counts.submitted_for_approval > 0) {
      // After in-progress / before not-started visually: insert before completed.
      const completedIdx = cards.findIndex((c) => c.key === 'completed');
      cards.splice(completedIdx, 0, SUBMITTED_KPI);
    }
    if (counts.rejected > 0) {
      cards.push(REJECTED_KPI);
    }
    return cards;
  }, [counts.rejected, counts.submitted_for_approval]);

  const kpiLabelFontSize = useMemo(
    () =>
      kpiLabelFontSizeForWidth(
        kpiLabelWidth,
        visibleCards.map((c) => c.label)
      ),
    [kpiLabelWidth, visibleCards]
  );

  const onKpiLabelLayout = useCallback((width: number) => {
    if (width <= 0) return;
    setKpiLabelWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
  }, []);

  return (
    <View style={styles.kpiRow}>
      {visibleCards.map((kpi) => {
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
            <View
              style={styles.kpiLabelWrap}
              onLayout={(e) => onKpiLabelLayout(e.nativeEvent.layout.width)}
            >
              <Text
                style={[styles.kpiLabel, { fontSize: kpiLabelFontSize }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={KPI_LABEL_MIN_FONT / KPI_LABEL_MAX_FONT}
                allowFontScaling={false}
              >
                {kpi.label}
              </Text>
            </View>
            <View style={[styles.kpiBadge, { backgroundColor: kpi.badgeBg }]}>
              <Text style={[styles.kpiCount, { color: kpi.countColor }]}>{count}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiCardSelected: {
    borderColor: '#1A4D3E',
    borderWidth: 2,
  },
  kpiLabelWrap: {
    width: '100%',
    marginBottom: 8,
    overflow: 'hidden',
  },
  kpiLabel: {
    width: '100%',
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
