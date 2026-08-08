import React from 'react';
import { View, ScrollView, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { isTaskOverdue, isTaskCompletedStatus, isTaskInProgressStatus } from '../../utils/taskCategorization';

export type TaskTableColumn = {
  key: string;
  label: string;
  flex: number;
  align?: 'left' | 'right' | 'center';
  render: (row: TaskTableRow) => React.ReactNode;
};

export type TaskTableRow = {
  id: string;
  name: string;
  status: string;
  due_date?: string | null;
  assigneeLabel?: string;
  projectLabel?: string;
  start_date?: string | null;
  submissionsCount?: number;
};

const TABLE_MIN_WIDTH = 720;

function formatEndDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
}

function statusColor(status: string, due?: string | null): string {
  if (isTaskCompletedStatus(status)) return '#70AD47';
  if (isTaskOverdue(due, status)) return '#E74C3C';
  if (isTaskInProgressStatus(status)) return '#FFC000';
  return '#4472C4';
}

function statusLabel(status: string, due?: string | null): string {
  if (isTaskCompletedStatus(status)) return 'Completed';
  if (isTaskOverdue(due, status)) return 'Overdue';
  if (isTaskInProgressStatus(status)) return 'In progress';
  const s = status.replace(/_/g, '-').toLowerCase();
  if (s === 'not-started' || s === 'open') return 'Not started';
  if (s === 'submitted-for-approval' || s === 'submitted') return 'Submitted';
  return status.replace(/_/g, ' ');
}

export function buildStatusCell(status: string, due?: string | null) {
  const bg = statusColor(status, due);
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={styles.statusText}>{statusLabel(status, due)}</Text>
    </View>
  );
}

export const defaultTaskColumns: TaskTableColumn[] = [
  {
    key: 'task',
    label: 'Task',
    flex: 2.5,
    render: (row) => (
      <Text style={styles.cellTask} numberOfLines={2}>{row.name}</Text>
    ),
  },
  {
    key: 'assignee',
    label: 'Assignee',
    flex: 1.5,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={2}>{row.assigneeLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'project',
    label: 'Project',
    flex: 1.8,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={2}>{row.projectLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'end',
    label: 'End',
    flex: 1,
    align: 'right',
    render: (row) => (
      <Text style={[styles.cell, styles.cellDate]}>{formatEndDate(row.due_date)}</Text>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    flex: 1.3,
    render: (row) => buildStatusCell(row.status, row.due_date),
  },
];

export const farmerTaskColumns: TaskTableColumn[] = [
  {
    key: 'task',
    label: 'Task',
    flex: 2.5,
    render: (row) => (
      <Text style={styles.cellTask} numberOfLines={2}>{row.name}</Text>
    ),
  },
  {
    key: 'assignedBy',
    label: 'Assigned by',
    flex: 1.5,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={2}>{row.assigneeLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'project',
    label: 'Project',
    flex: 1.8,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={2}>{row.projectLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'end',
    label: 'End',
    flex: 1,
    align: 'right',
    render: (row) => (
      <Text style={[styles.cell, styles.cellDate]}>{formatEndDate(row.due_date)}</Text>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    flex: 1.3,
    render: (row) => buildStatusCell(row.status, row.due_date),
  },
];

type Props = {
  rows: TaskTableRow[];
  columns?: TaskTableColumn[];
  onRowPress: (row: TaskTableRow) => void;
  emptyMessage?: string;
  highlightId?: string;
};

export function TasksTableView({
  rows,
  columns = defaultTaskColumns,
  onRowPress,
  emptyMessage = 'No tasks found',
  highlightId,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const tableWidth = Math.max(TABLE_MIN_WIDTH, windowWidth - 32);
  const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const tableBody = (
    <>
      <View style={styles.headerRow}>
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[
              styles.headerCell,
              { flex: col.flex },
              col.align === 'right' && styles.alignRight,
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {rows.map((row) => {
        const highlighted = highlightId === row.id;
        return (
          <Pressable
            key={row.id}
            onPress={() => onRowPress(row)}
            accessibilityRole="button"
            accessibilityLabel={`Open task ${row.name}`}
            style={[
              styles.dataRow,
              highlighted && styles.dataRowHighlight,
              webPressable,
            ]}
          >
            {columns.map((col) => (
              <View
                key={col.key}
                style={[
                  styles.cellWrap,
                  { flex: col.flex },
                  col.align === 'right' && styles.alignRight,
                ]}
              >
                {col.render(row)}
              </View>
            ))}
          </Pressable>
        );
      })}
    </>
  );

  return (
    <View style={styles.tableOuter}>
      {Platform.OS === 'web' ? (
        <View style={styles.webScroll}>
          <View style={[styles.table, { minWidth: tableWidth }]}>{tableBody}</View>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={[styles.table, { minWidth: tableWidth }]}>{tableBody}</View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tableOuter: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
  },
  webScroll: Platform.select({
    web: { overflow: 'auto' as const },
    default: {},
  }),
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    paddingRight: 8,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  dataRowHighlight: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 3,
    borderLeftColor: '#1A4D3E',
  },
  cellWrap: {
    paddingRight: 8,
    justifyContent: 'center',
  },
  cell: {
    fontSize: 13,
    color: '#1A1A1A',
  },
  cellTask: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  cellDate: {
    textAlign: 'right',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
    minWidth: 80,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  empty: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 50,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
  },
});
