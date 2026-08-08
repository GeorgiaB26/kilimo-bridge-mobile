import React from 'react';
import { View, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { isTaskOverdue, isTaskCompletedStatus, isTaskInProgressStatus } from '../../utils/taskCategorization';

export type TaskTableColumn = {
  key: string;
  label: string;
  flex: number;
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
    flex: 2.2,
    render: (row) => (
      <Text style={styles.cellTask} numberOfLines={2}>{row.name}</Text>
    ),
  },
  {
    key: 'assignee',
    label: 'Assignee',
    flex: 1.3,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={1}>{row.assigneeLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'project',
    label: 'Project',
    flex: 1.5,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={1}>{row.projectLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'end',
    label: 'End',
    flex: 1,
    render: (row) => (
      <Text style={styles.cell}>{formatEndDate(row.due_date)}</Text>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    flex: 1.2,
    render: (row) => buildStatusCell(row.status, row.due_date),
  },
];

export const farmerTaskColumns: TaskTableColumn[] = [
  {
    key: 'task',
    label: 'Task',
    flex: 2.2,
    render: (row) => (
      <Text style={styles.cellTask} numberOfLines={2}>{row.name}</Text>
    ),
  },
  {
    key: 'assignedBy',
    label: 'Assigned by',
    flex: 1.3,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={1}>{row.assigneeLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'project',
    label: 'Project',
    flex: 1.5,
    render: (row) => (
      <Text style={styles.cell} numberOfLines={1}>{row.projectLabel ?? '—'}</Text>
    ),
  },
  {
    key: 'end',
    label: 'End',
    flex: 1,
    render: (row) => (
      <Text style={styles.cell}>{formatEndDate(row.due_date)}</Text>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    flex: 1.2,
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
  const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text className="text-sm text-[#999999]">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.tableWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.table}>
          <View style={styles.headerRow}>
            {columns.map((col) => (
              <Text key={col.key} style={[styles.headerCell, { flex: col.flex }]}>
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
                style={[
                  styles.dataRow,
                  highlighted && styles.dataRowHighlight,
                  webPressable,
                ]}
              >
                {columns.map((col) => (
                  <View key={col.key} style={{ flex: col.flex, paddingRight: 4 }}>
                    {col.render(row)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  table: {
    minWidth: 640,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
    paddingRight: 4,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    alignItems: 'center',
  },
  dataRowHighlight: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 3,
    borderLeftColor: '#1A4D3E',
  },
  cell: {
    fontSize: 12,
    color: '#333333',
  },
  cellTask: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
});
