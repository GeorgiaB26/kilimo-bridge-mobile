/** Shared task categorization: OVERDUE → IN PROGRESS → NOT STARTED → SUBMITTED → REJECTED → COMPLETED */

export type DueDateInput = string | Date | null | undefined;

export interface CategorizableTaskRow {
  status: string;
  due_date?: DueDateInput;
}

export interface TaskCategoryCounts {
  overdue: number;
  inProgress: number;
  notStarted: number;
  submittedForApproval: number;
  rejected: number;
  completed: number;
  total: number;
}

function normalizeStatusForCategory(status?: string | null): string {
  const s = (status ?? 'not-started').toLowerCase().replace(/_/g, '-');
  if (s === 'submitted') return 'submitted-for-approval';
  if (s === 'approved') return 'completed';
  return s;
}

function isCompletedStatus(status?: string | null): boolean {
  return normalizeStatusForCategory(status) === 'completed';
}

function isRejectedStatus(status?: string | null): boolean {
  return normalizeStatusForCategory(status) === 'rejected';
}

function isSubmittedForApprovalStatus(status?: string | null): boolean {
  return normalizeStatusForCategory(status) === 'submitted-for-approval';
}

function isInProgressStatus(status?: string | null): boolean {
  return normalizeStatusForCategory(status) === 'in-progress';
}

export function normalizeDueDateInput(due?: DueDateInput): string | null {
  if (due == null) return null;
  if (typeof due === 'string') {
    const trimmed = due.trim();
    return trimmed.length ? trimmed : null;
  }
  if (due instanceof Date && !Number.isNaN(due.getTime())) {
    return due.toISOString();
  }
  const asString = String(due).trim();
  return asString.length ? asString : null;
}

export function parseDueDay(due?: DueDateInput): Date | null {
  const normalized = normalizeDueDateInput(due);
  if (!normalized) return null;
  const d = new Date(normalized.includes('T') ? normalized : `${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function compareDueDates(a?: DueDateInput, b?: DueDateInput): number {
  const da = parseDueDay(a);
  const db = parseDueDay(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}

function isOverdue(due?: DueDateInput, status?: string | null): boolean {
  if (
    status &&
    (isCompletedStatus(status) ||
      isRejectedStatus(status) ||
      isSubmittedForApprovalStatus(status))
  ) {
    return false;
  }
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
  let submittedForApproval = 0;
  let rejected = 0;
  let completed = 0;

  for (const task of tasks) {
    if (isCompletedStatus(task.status)) {
      completed++;
      continue;
    }
    if (isRejectedStatus(task.status)) {
      rejected++;
      continue;
    }
    if (isSubmittedForApprovalStatus(task.status)) {
      submittedForApproval++;
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
    submittedForApproval,
    rejected,
    completed,
    total: tasks.length,
  };
}
