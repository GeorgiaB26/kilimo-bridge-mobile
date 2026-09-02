/** Shared task categorization: OVERDUE → IN PROGRESS → NOT STARTED → SUBMITTED → REJECTED → COMPLETED */

export type TaskCategoryFilter =
  | 'overdue'
  | 'in_progress'
  | 'not_started'
  | 'submitted_for_approval'
  | 'rejected'
  | 'completed';

export interface CategorizableTask {
  status: string;
  due_date?: string | null;
}

export interface CategorizedTasks<T> {
  overdue: T[];
  inProgress: T[];
  notStarted: T[];
  submittedForApproval: T[];
  rejected: T[];
  completed: T[];
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

function normalizeStatusForCategory(status: string): string {
  const s = (status || 'not-started').toLowerCase().replace(/_/g, '-');
  if (s === 'submitted') return 'submitted-for-approval';
  if (s === 'approved') return 'completed';
  return s;
}

export function isTaskCompletedStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'completed';
}

export function isTaskRejectedStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'rejected';
}

export function isTaskSubmittedForApprovalStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'submitted-for-approval';
}

export function isTaskInProgressStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'in-progress';
}

function parseDueDay(due?: string | null): Date | null {
  if (!due?.trim()) return null;
  const d = new Date(due.includes('T') ? due : `${due}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isTaskOverdue(due?: string | null, status?: string): boolean {
  if (
    status &&
    (isTaskCompletedStatus(status) ||
      isTaskRejectedStatus(status) ||
      isTaskSubmittedForApprovalStatus(status))
  ) {
    return false;
  }
  const dueDay = parseDueDay(due);
  if (!dueDay) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDay < today;
}

function sortByDueDate<T extends CategorizableTask>(a: T, b: T): number {
  const da = parseDueDay(a.due_date);
  const db = parseDueDay(b.due_date);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}

export function categorizeTasks<T extends CategorizableTask>(tasks: T[]): CategorizedTasks<T> {
  const result: CategorizedTasks<T> = {
    overdue: [],
    inProgress: [],
    notStarted: [],
    submittedForApproval: [],
    rejected: [],
    completed: [],
  };

  for (const task of tasks) {
    if (isTaskCompletedStatus(task.status)) {
      result.completed.push(task);
      continue;
    }
    if (isTaskRejectedStatus(task.status)) {
      result.rejected.push(task);
      continue;
    }
    if (isTaskSubmittedForApprovalStatus(task.status)) {
      result.submittedForApproval.push(task);
      continue;
    }
    if (isTaskOverdue(task.due_date, task.status)) {
      result.overdue.push(task);
      continue;
    }
    if (isTaskInProgressStatus(task.status)) {
      result.inProgress.push(task);
      continue;
    }
    result.notStarted.push(task);
  }

  result.overdue.sort(sortByDueDate);
  result.inProgress.sort(sortByDueDate);
  result.notStarted.sort(sortByDueDate);
  result.submittedForApproval.sort(sortByDueDate);
  result.rejected.sort(sortByDueDate);
  result.completed.sort(sortByDueDate);

  return result;
}

export function countTaskCategories(tasks: CategorizableTask[]): TaskCategoryCounts {
  const categorized = categorizeTasks(tasks);
  return {
    overdue: categorized.overdue.length,
    inProgress: categorized.inProgress.length,
    notStarted: categorized.notStarted.length,
    submittedForApproval: categorized.submittedForApproval.length,
    rejected: categorized.rejected.length,
    completed: categorized.completed.length,
    total: tasks.length,
  };
}

/**
 * KPI counts where Overdue overlaps status buckets.
 * In Progress / Not Started include overdue tasks of that status (matches status filters).
 * Completed / rejected / submitted stay exclusive and never count as overdue.
 */
export function countOverlappingStatusKpis(tasks: CategorizableTask[]): {
  overdue: number;
  in_progress: number;
  not_started: number;
  submitted_for_approval: number;
  rejected: number;
  completed: number;
} {
  let overdue = 0;
  let in_progress = 0;
  let not_started = 0;
  let submitted_for_approval = 0;
  let rejected = 0;
  let completed = 0;

  for (const task of tasks) {
    if (isTaskCompletedStatus(task.status)) {
      completed += 1;
      continue;
    }
    if (isTaskRejectedStatus(task.status)) {
      rejected += 1;
      continue;
    }
    if (isTaskSubmittedForApprovalStatus(task.status)) {
      submitted_for_approval += 1;
      continue;
    }
    if (isTaskOverdue(task.due_date, task.status)) {
      overdue += 1;
    }
    if (isTaskInProgressStatus(task.status)) {
      in_progress += 1;
    } else if (normalizeStatusForCategory(task.status) === 'not-started') {
      not_started += 1;
    } else {
      // Match categorizeTasks: unknown active statuses land in Not Started.
      not_started += 1;
    }
  }

  return {
    overdue,
    in_progress,
    not_started,
    submitted_for_approval,
    rejected,
    completed,
  };
}

/** Status filter used by KPI rows on agent/farmer task screens (overlapping overdue counts). */
export function taskMatchesStatusFilter(
  task: CategorizableTask,
  filter: 'all' | TaskCategoryFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return isTaskOverdue(task.due_date, task.status);
  const s = normalizeStatusForCategory(task.status);
  switch (filter) {
    case 'not_started':
      return s === 'not-started';
    case 'in_progress':
      return s === 'in-progress';
    case 'submitted_for_approval':
      return s === 'submitted-for-approval';
    case 'rejected':
      return s === 'rejected';
    case 'completed':
      return isTaskCompletedStatus(task.status);
    default:
      return true;
  }
}

export function pickCategorizedTasks<T>(
  categorized: CategorizedTasks<T>,
  filter: 'all' | TaskCategoryFilter
): CategorizedTasks<T> {
  if (filter === 'all') return categorized;
  return {
    overdue: filter === 'overdue' ? categorized.overdue : [],
    inProgress: filter === 'in_progress' ? categorized.inProgress : [],
    notStarted: filter === 'not_started' ? categorized.notStarted : [],
    submittedForApproval:
      filter === 'submitted_for_approval' ? categorized.submittedForApproval : [],
    rejected: filter === 'rejected' ? categorized.rejected : [],
    completed: filter === 'completed' ? categorized.completed : [],
  };
}
