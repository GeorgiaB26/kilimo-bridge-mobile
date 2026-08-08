import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import type { TaskCategoryFilter } from '../../utils/taskCategorization';
import { countTaskCategories } from '../../utils/taskCategorization';
import type { CategorizableTask } from '../../utils/taskCategorization';

type FilterKey = 'all' | TaskCategoryFilter;

type Props<T extends CategorizableTask> = {
  tasks: T[];
  activeFilter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
};

export function TasksSummaryCards<T extends CategorizableTask>({
  tasks,
  activeFilter,
  onFilterChange,
}: Props<T>) {
  const counts = countTaskCategories(tasks);

  const cards: Array<{
    key: FilterKey;
    label: string;
    count: number;
    style: object;
    countColor?: string;
  }> = [
    {
      key: 'overdue',
      label: 'OVERDUE',
      count: counts.overdue,
      style: styles.overdueCard,
      countColor: '#E74C3C',
    },
    {
      key: 'in_progress',
      label: 'IN PROGRESS',
      count: counts.inProgress,
      style: styles.inProgressCard,
      countColor: '#F59E0B',
    },
    {
      key: 'not_started',
      label: 'NOT STARTED',
      count: counts.notStarted,
      style: styles.notStartedCard,
      countColor: '#4472C4',
    },
    {
      key: 'completed',
      label: 'COMPLETED',
      count: counts.completed,
      style: styles.completedCard,
      countColor: '#70AD47',
    },
  ];

  return (
    <View style={styles.container}>
      {cards.map((card, index) => (
        <Pressable
          key={card.key}
          onPress={() => onFilterChange(activeFilter === card.key ? 'all' : card.key)}
          style={[
            styles.card,
            card.style,
            activeFilter === card.key && styles.cardActive,
            index < cards.length - 1 && styles.cardDivider,
          ]}
        >
          <Text style={[styles.count, card.countColor ? { color: card.countColor } : null]}>
            {card.count}
          </Text>
          <Text style={styles.label}>{card.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  card: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDivider: {
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  cardActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#1A4D3E',
  },
  overdueCard: {
    backgroundColor: '#FFEBEE',
  },
  inProgressCard: {
    backgroundColor: '#FFF8E1',
  },
  notStartedCard: {
    backgroundColor: '#E3F2FD',
  },
  completedCard: {
    backgroundColor: '#E8F5E9',
  },
  count: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
});
