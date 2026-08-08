/** Shared task categorization: OVERDUE → IN PROGRESS → NOT STARTED → REJECTED → COMPLETED */

export type TaskCategoryFilter =
  | 'overdue'
  | 'in_progress'
  | 'not_started'
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
  rejected: T[];
  completed: T[];
}

export interface TaskCategoryCounts {
  overdue: number;
  inProgress: number;
  notStarted: number;
  rejected: number;
  completed: number;
  total: number;
}

function normalizeStatusForCategory(status: string): string {
  const s = (status || 'not-started').toLowerCase().replace(/_/g, '-');
  if (s === 'submitted-for-approval' || s === 'submitted') return 'in-progress';
  if (s === 'approved') return 'completed';
  return s;
}

export function isTaskCompletedStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'completed';
}

export function isTaskRejectedStatus(status: string): boolean {
  return normalizeStatusForCategory(status) === 'rejected';
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
  if (status && (isTaskCompletedStatus(status) || isTaskRejectedStatus(status))) return false;
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
    rejected: categorized.rejected.length,
    completed: categorized.completed.length,
    total: tasks.length,
  };
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
    rejected: filter === 'rejected' ? categorized.rejected : [],
    completed: filter === 'completed' ? categorized.completed : [],
  };
}
