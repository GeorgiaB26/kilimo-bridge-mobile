import type { ComponentType } from 'react';
import {
  Banknote,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  Info,
  Mail,
  MessageCircle,
  Tractor,
} from 'lucide-react-native';
import { formatCleanDate } from '../utils/greeting';

export type NotificationIcon = ComponentType<{ size?: number | string; color?: string }>;

export const NOTIFICATION_CONFIG: Record<
  string,
  { Icon: NotificationIcon; title: string; color: string }
> = {
  farmer_registered: { Icon: Tractor, title: 'New Farmer Registered', color: '#70AD47' },
  farmer_help_request: { Icon: CircleHelp, title: 'Farmer Needs Help', color: '#9966CC' },
  help_request: { Icon: CircleHelp, title: 'Help Request', color: '#9966CC' },
  help_request_sent: { Icon: Mail, title: 'Message Sent', color: '#4472C4' },
  help_request_resolved: { Icon: CircleCheck, title: 'Help Resolved', color: '#70AD47' },
  help_response: { Icon: CircleHelp, title: 'Support Response', color: '#9966CC' },
  task_assigned: { Icon: CircleCheck, title: 'New Task Assigned', color: '#4472C4' },
  task_completed: { Icon: CircleCheck, title: 'Task Completed', color: '#70AD47' },
  task_approved: { Icon: CircleCheck, title: 'Task Approved', color: '#70AD47' },
  task_rejected: { Icon: CircleX, title: 'Task Rejected', color: '#E74C3C' },
  task: { Icon: ClipboardList, title: 'Task Update', color: '#4472C4' },
  payment_ready: { Icon: Banknote, title: 'Payment Ready', color: '#FFC000' },
  payment: { Icon: Banknote, title: 'Payment Update', color: '#FFC000' },
  payment_processed: { Icon: Banknote, title: 'Payment Processed', color: '#FFC000' },
  verification_approved: { Icon: CircleCheck, title: 'Verification Approved', color: '#70AD47' },
  verification_rejected: { Icon: CircleX, title: 'Verification Rejected', color: '#E74C3C' },
  farmer_verified: { Icon: CircleCheck, title: 'Farmer Verified', color: '#70AD47' },
  project_assigned: { Icon: ClipboardList, title: 'Project Assigned', color: '#4472C4' },
  project: { Icon: ClipboardList, title: 'Project Update', color: '#4472C4' },
  registration_approved: { Icon: CircleCheck, title: 'Registration Approved', color: '#70AD47' },
  registration_rejected: { Icon: CircleX, title: 'Registration Rejected', color: '#E74C3C' },
  message_received: { Icon: MessageCircle, title: 'New Message', color: '#4472C4' },
  info: { Icon: Info, title: 'Notification', color: '#4472C4' },
};

export function formatTimeAgo(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatCleanDate(value);
}

export function formatMessageTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
