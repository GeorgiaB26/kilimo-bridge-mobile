import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { getFarmerAgentAssignedTask, getFarmerTaskStatus } from '../api/client';

const POLL_MS = 30_000;

interface TaskRow {
  id: string;
  name: string;
  status: string;
  payment_value_kes?: number;
  source?: 'hierarchy' | 'agent_assignment';
}

/**
 * Polls task status every 30s for submitted tasks (hierarchy + agent_assignment).
 * Shows alerts on approval or rejection.
 */
export function useTaskApprovalPolling(
  tasks: TaskRow[],
  onRefresh: () => Promise<void> | void
): void {
  const prevStatusRef = useRef<Record<string, string>>({});
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of tasks) {
      const prev = prevStatusRef.current[t.id];
      const normalized = t.status.replace(/_/g, '-');
      if (
        prev === 'submitted-for-approval' &&
        normalized === 'approved' &&
        !notifiedRef.current.has(`${t.id}-approved`)
      ) {
        notifiedRef.current.add(`${t.id}-approved`);
        const msg =
          t.source === 'agent_assignment'
            ? 'Your field agent approved this task.'
            : 'Task approved! Payment pending.';
        Alert.alert('Task approved', msg);
      }
      if (
        prev === 'submitted-for-approval' &&
        normalized === 'rejected' &&
        !notifiedRef.current.has(`${t.id}-rejected`)
      ) {
        notifiedRef.current.add(`${t.id}-rejected`);
        Alert.alert(
          'Task rejected',
          'Your submission was rejected. See the reason on the task card and tap Resubmit.'
        );
      }
      prevStatusRef.current[t.id] = normalized;
    }
  }, [tasks]);

  useEffect(() => {
    const pending = tasks.filter(
      (t) => t.status.replace(/_/g, '-') === 'submitted-for-approval'
    );
    if (pending.length === 0) return;

    const poll = async () => {
      await Promise.all(
        pending.map(async (t) => {
          try {
            const data =
              t.source === 'agent_assignment'
                ? await getFarmerAgentAssignedTask(t.id)
                : await getFarmerTaskStatus(t.id);
            const status = String(data.status ?? '').replace(/_/g, '-');
            if (status === 'approved' && !notifiedRef.current.has(`${t.id}-approved`)) {
              notifiedRef.current.add(`${t.id}-approved`);
              const msg =
                t.source === 'agent_assignment'
                  ? 'Your field agent approved this task.'
                  : 'Task approved! Payment pending.';
              Alert.alert('Task approved', msg);
            }
            if (status === 'rejected' && !notifiedRef.current.has(`${t.id}-rejected`)) {
              notifiedRef.current.add(`${t.id}-rejected`);
              Alert.alert(
                'Task rejected',
                data.rejection_reason ?? 'Please review feedback and resubmit.'
              );
            }
          } catch {
            // ignore poll errors
          }
        })
      );
      await onRefresh();
    };

    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [tasks, onRefresh]);
}
