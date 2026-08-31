import type { ComponentType } from 'react';
import {
  Banknote,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  Eye,
  Info,
  Mail,
  MessageCircle,
  Tractor,
  TriangleAlert,
} from 'lucide-react-native';

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
  task_started: { Icon: CircleCheck, title: 'Farmer Started Task', color: '#70AD47' },
  task_status_updated: { Icon: ClipboardList, title: 'Task Updated', color: '#4472C4' },
  task_qc_failed: { Icon: CircleX, title: 'Task QC Check Failed', color: '#E74C3C' },
  task_rejected: { Icon: CircleX, title: 'Task Rejected', color: '#E74C3C' },
  error: { Icon: CircleX, title: 'Alert', color: '#E74C3C' },
  success: { Icon: CircleCheck, title: 'Update', color: '#70AD47' },
  warning: { Icon: TriangleAlert, title: 'Attention Needed', color: '#FFC000' },
  payment_ready: { Icon: Banknote, title: 'Payment Ready', color: '#FFC000' },
  payment: { Icon: Banknote, title: 'Payment Update', color: '#FFC000' },
  payment_processed: { Icon: Banknote, title: 'Payment Processed', color: '#FFC000' },
  verification_approved: { Icon: CircleCheck, title: 'Verification Approved', color: '#70AD47' },
  verification_rejected: { Icon: CircleX, title: 'Verification Rejected', color: '#E74C3C' },
  farmer_photo_update: { Icon: Tractor, title: 'Profile Photo Update', color: '#FFC000' },
  farmer_photo_approved: { Icon: CircleCheck, title: 'Profile image has been approved', color: '#70AD47' },
  farmer_photo_rejected: { Icon: CircleX, title: 'Profile image is rejected', color: '#E74C3C' },
  project_assigned: { Icon: ClipboardList, title: 'Project Assigned', color: '#4472C4' },
  project: { Icon: ClipboardList, title: 'Project Update', color: '#4472C4' },
  registration_approved: { Icon: CircleCheck, title: 'Registration Approved', color: '#70AD47' },
  field_verification_assigned: {
    Icon: Eye,
    title: 'Member Needs Field Verification',
    color: '#FFC000',
  },
  registration_rejected: { Icon: CircleX, title: 'Registration Rejected', color: '#E74C3C' },
  message_received: { Icon: MessageCircle, title: 'New Message', color: '#4472C4' },
  support_ticket_reply: { Icon: MessageCircle, title: 'Support replied', color: '#9966CC' },
  support_ticket_created: { Icon: MessageCircle, title: 'New support ticket', color: '#9966CC' },
  support_ticket_resolved: { Icon: CircleCheck, title: 'Support ticket resolved', color: '#70AD47' },
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
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatMessageTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
