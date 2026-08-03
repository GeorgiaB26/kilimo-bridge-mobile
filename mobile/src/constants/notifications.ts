export const NOTIFICATION_CONFIG: Record<
  string,
  { icon: string; title: string; color: string }
> = {
  farmer_registered: { icon: '🚜', title: 'New Farmer Registered', color: '#70AD47' },
  farmer_help_request: { icon: '❓', title: 'Farmer Needs Help', color: '#9966CC' },
  help_request: { icon: '❓', title: 'Help Request', color: '#9966CC' },
  help_request_sent: { icon: '✉️', title: 'Message Sent', color: '#4472C4' },
  help_request_resolved: { icon: '✅', title: 'Help Resolved', color: '#70AD47' },
  help_response: { icon: '❓', title: 'Support Response', color: '#9966CC' },
  task_assigned: { icon: '✅', title: 'New Task Assigned', color: '#4472C4' },
  task_completed: { icon: '✅', title: 'Task Completed', color: '#70AD47' },
  payment_ready: { icon: '💰', title: 'Payment Ready', color: '#FFC000' },
  payment: { icon: '💰', title: 'Payment Update', color: '#FFC000' },
  payment_processed: { icon: '💰', title: 'Payment Processed', color: '#FFC000' },
  verification_approved: { icon: '✅', title: 'Verification Approved', color: '#70AD47' },
  verification_rejected: { icon: '❌', title: 'Verification Rejected', color: '#E74C3C' },
  farmer_verified: { icon: '✔️', title: 'Farmer Verified', color: '#70AD47' },
  project_assigned: { icon: '📋', title: 'Project Assigned', color: '#4472C4' },
  project: { icon: '📋', title: 'Project Update', color: '#4472C4' },
  registration_approved: { icon: '✅', title: 'Registration Approved', color: '#70AD47' },
  registration_rejected: { icon: '❌', title: 'Registration Rejected', color: '#E74C3C' },
  message_received: { icon: '💬', title: 'New Message', color: '#4472C4' },
  info: { icon: 'ℹ️', title: 'Notification', color: '#4472C4' },
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
