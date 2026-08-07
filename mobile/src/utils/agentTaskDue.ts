/** Shared overdue logic — matches backend classifyTaskDue in agentDashboardService. */

const COMPLETED_STATUSES = new Set(['completed', 'approved']);

export function isAgentTaskOverdue(
  dueDate?: string | null,
  status?: string | null,
  now = new Date()
): boolean {
  if (!dueDate?.trim()) return false;
  if (status && COMPLETED_STATUSES.has(status.toLowerCase())) return false;
  if (status === 'completed') return false;

  const due = new Date(dueDate.includes('T') ? dueDate : `${dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function isAgentTaskUpcoming(
  dueDate?: string | null,
  status?: string | null,
  now = new Date()
): boolean {
  if (!dueDate?.trim()) return false;
  if (status && COMPLETED_STATUSES.has(status.toLowerCase())) return false;

  const due = new Date(dueDate.includes('T') ? dueDate : `${dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  due.setHours(0, 0, 0, 0);
  return due >= today && due <= week;
}
