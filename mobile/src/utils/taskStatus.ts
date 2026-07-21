import type { TaskStatus } from '../../../shared/src/hierarchy';

export function taskStatusLabel(status: TaskStatus | string): string {
  const map: Record<string, string> = {
    'not-started': 'Not started',
    'in-progress': 'In progress',
    'submitted-for-approval': 'Submitted for Approval',
    approved: 'Approved',
    completed: 'Completed',
    rejected: 'Rejected',
  };
  return map[status] ?? status;
}

export function taskStatusVariant(status: TaskStatus | string): 'success' | 'pending' | 'info' | 'warning' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'completed') return 'success';
  if (status === 'submitted-for-approval') return 'info';
  if (status === 'rejected') return 'danger';
  if (status === 'in-progress') return 'warning';
  return 'pending';
}
