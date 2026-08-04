import type { ComponentType } from 'react';
import {
  Banknote,
  Check,
  CircleCheck,
  CircleX,
  ClipboardList,
  Plus,
  User,
  Users,
} from 'lucide-react-native';

export type AuditIcon = ComponentType<{ size?: number | string; color?: string }>;

/** Friendly labels for agent activity log entries */
export function formatAgentAuditEntry(entry: {
  action?: string;
  category?: string;
  created_at?: string;
  details?: string | Record<string, unknown> | null;
  resource_type?: string;
}): { Icon: AuditIcon; title: string; subtitle?: string; time: string } {
  let details: Record<string, unknown> = {};
  if (typeof entry.details === 'string') {
    try {
      details = JSON.parse(entry.details) as Record<string, unknown>;
    } catch {
      details = {};
    }
  } else if (entry.details && typeof entry.details === 'object') {
    details = entry.details as Record<string, unknown>;
  }

  const activityType = details.activity_type as string | undefined;
  const farmerName = details.farmer_name as string | undefined;
  const taskName = details.task_name as string | undefined;
  const name = details.name as string | undefined;

  let Icon: AuditIcon = ClipboardList;
  let title = entry.action ?? 'Activity';

  if (activityType === 'task_created' || (entry.action === 'agent.action' && name)) {
    Icon = Plus;
    title = `Created task: ${name}`;
  } else if (entry.action === 'farmer.create' || activityType === 'farmer_registered') {
    Icon = Users;
    title = farmerName ? `Registered ${farmerName}` : 'Registered new farmer';
  } else if (entry.action?.includes('verify') || activityType === 'farmer_verified') {
    Icon = CircleCheck;
    title = farmerName ? `Verified ${farmerName}` : 'Verified farmer';
  } else if (activityType === 'task_approved' || entry.action === 'payment.verify') {
    Icon = Check;
    title = taskName
      ? `Approved task: ${taskName}`
      : farmerName
        ? `Approved task by ${farmerName}`
        : 'Approved task';
  } else if (activityType === 'task_rejected') {
    Icon = CircleX;
    title = taskName
      ? `Rejected task: ${taskName}`
      : farmerName
        ? `Rejected task by ${farmerName}`
        : 'Rejected task';
  } else if (activityType === 'task_reviewed') {
    Icon = ClipboardList;
    title =
      farmerName && taskName
        ? `Reviewed ${taskName} — ${farmerName}`
        : 'Reviewed task completion';
  } else if (entry.action === 'agent.register') {
    Icon = User;
    title = 'Agent registration';
  } else if (entry.category === 'financial') {
    Icon = Banknote;
    title = 'Payment activity';
  }

  const location = details.location as string | undefined;
  const status = details.status as string | undefined;
  const subtitleParts = [location, status ? `Status: ${status}` : undefined].filter(Boolean);

  const time = formatAuditTime(entry.created_at);

  return {
    Icon,
    title,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
    time,
  };
}

export function formatAuditTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function groupAuditByDate(
  logs: Array<{ created_at?: string }>
): Array<{ label: string; items: typeof logs }> {
  const groups: Record<string, typeof logs> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const log of logs) {
    const d = new Date(log.created_at ?? '');
    if (Number.isNaN(d.getTime())) {
      const key = 'Earlier';
      groups[key] = groups[key] ?? [];
      groups[key].push(log);
      continue;
    }
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    let label: string;
    if (day.getTime() === today.getTime()) {
      label = 'Today';
    } else if (day.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else {
      label = d
        .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        .toUpperCase();
    }
    groups[label] = groups[label] ?? [];
    groups[label].push(log);
  }

  const order = ['Today', 'Yesterday'];
  const keys = Object.keys(groups).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return b.localeCompare(a);
  });
  return keys.map((label) => ({ label, items: groups[label] }));
}
