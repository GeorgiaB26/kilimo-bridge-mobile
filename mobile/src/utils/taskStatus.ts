import type { TaskStatus } from '../../shared/src/hierarchy';

function normalizeTaskStatusKey(status: TaskStatus | string): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function isSubmittedForApprovalStatus(status: string | undefined | null): boolean {
  const s = normalizeTaskStatusKey(status ?? '');
  return s === 'submitted-for-approval' || s === 'submitted';
}

export function taskStatusLabel(status: TaskStatus | string): string {
  const key = normalizeTaskStatusKey(status);
  const map: Record<string, string> = {
    'not-started': 'Not started',
    'in-progress': 'In progress',
    'submitted-for-approval': 'Submitted for Approval',
    approved: 'Approved',
    completed: 'Completed',
    rejected: 'Rejected',
  };
  return map[key] ?? String(status);
}

export function taskStatusVariant(status: TaskStatus | string): 'success' | 'pending' | 'info' | 'warning' | 'danger' {
  const key = normalizeTaskStatusKey(status);
  if (key === 'approved') return 'success';
  if (key === 'completed') return 'success';
  if (key === 'submitted-for-approval') return 'info';
  if (key === 'rejected') return 'danger';
  if (key === 'in-progress') return 'warning';
  return 'pending';
}
