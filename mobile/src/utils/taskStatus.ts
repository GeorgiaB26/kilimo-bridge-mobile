import type { TaskStatus } from '../../../shared/src/hierarchy';

export function taskStatusLabel(status: TaskStatus | string): string {
  const map: Record<string, string> = {
    'not-started': 'Not started',
    'in-progress': 'In progress',
    'submitted-for-approval': 'Submitted for Approval',
    approved: 'Approved',
    completed: 'Completed',
    rejected: 'Needs rework',
  };
  return map[status] ?? status;
}

export function taskStatusVariant(status: TaskStatus | string): 'success' | 'pending' | 'info' | 'warning' {
  if (status === 'approved' || status === 'completed') return 'success';
  if (status === 'submitted-for-approval') return 'pending';
  if (status === 'rejected') return 'warning';
  if (status === 'in-progress') return 'info';
  return 'info';
}
