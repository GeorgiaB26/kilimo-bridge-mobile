import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { getFarmerTaskStatus } from '../api/client';

const POLL_MS = 30_000;

interface TaskRow {
  id: string;
  name: string;
  status: string;
  payment_value_kes?: number;
}

/**
 * Polls /api/farmer/tasks/:id/status every 30s for submitted tasks.
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
      if (prev === 'submitted-for-approval' && t.status === 'approved' && !notifiedRef.current.has(`${t.id}-approved`)) {
        notifiedRef.current.add(`${t.id}-approved`);
        Alert.alert('✓ Task approved', 'Task approved! Payment pending.');
      }
      if (prev === 'submitted-for-approval' && t.status === 'rejected' && !notifiedRef.current.has(`${t.id}-rejected`)) {
        notifiedRef.current.add(`${t.id}-rejected`);
        Alert.alert('Task rejected', 'Your submission was rejected. See the reason on the task card and tap Resubmit.');
      }
      prevStatusRef.current[t.id] = t.status;
    }
  }, [tasks]);

  useEffect(() => {
    const pending = tasks.filter((t) => t.status === 'submitted-for-approval');
    if (pending.length === 0) return;

    const poll = async () => {
      await Promise.all(
        pending.map(async (t) => {
          try {
            const data = await getFarmerTaskStatus(t.id);
            if (data.status === 'approved' && !notifiedRef.current.has(`${t.id}-approved`)) {
              notifiedRef.current.add(`${t.id}-approved`);
              Alert.alert('✓ Task approved', 'Task approved! Payment pending.');
            }
            if (data.status === 'rejected' && !notifiedRef.current.has(`${t.id}-rejected`)) {
              notifiedRef.current.add(`${t.id}-rejected`);
              Alert.alert('Task rejected', data.rejection_reason ?? 'Please review feedback and resubmit.');
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
