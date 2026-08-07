/** Shared task categorization: OVERDUE → IN PROGRESS → NOT STARTED → COMPLETED */

export interface CategorizableTaskRow {
  status: string;
  due_date?: string | null;
}

export interface TaskCategoryCounts {
  overdue: number;
  inProgress: number;
  notStarted: number;
  completed: number;
  total: number;
}

function normalizeStatusForCategory(status: string): string {
  const s = status.toLowerCase().replace(/_/g, '-');
  if (s === 'submitted-for-approval' || s === 'submitted') return 'in-progress';
  if (s === 'approved') return 'completed';
  return s;
}

function isCompletedStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'completed';
}

function isInProgressStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'in-progress';
}

function parseDueDay(due?: string | null): Date | null {
  if (!due?.trim()) return null;
  const d = new Date(due.includes('T') ? due : `${due}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdue(due?: string | null, status?: string): boolean {
  if (status && isCompletedStatus(status)) return false;
  const dueDay = parseDueDay(due);
  if (!dueDay) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDay < today;
}

export function countTaskCategories(tasks: CategorizableTaskRow[]): TaskCategoryCounts {
  let overdue = 0;
  let inProgress = 0;
  let notStarted = 0;
  let completed = 0;

  for (const task of tasks) {
    if (isCompletedStatus(task.status)) {
      completed++;
      continue;
    }
    if (isOverdue(task.due_date, task.status)) {
      overdue++;
      continue;
    }
    if (isInProgressStatus(task.status)) {
      inProgress++;
      continue;
    }
    notStarted++;
  }

  return {
    overdue,
    inProgress,
    notStarted,
    completed,
    total: tasks.length,
  };
}
