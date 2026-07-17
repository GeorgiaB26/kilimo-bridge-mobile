import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { getFarmerTaskApprovalStatus } from '../api/client';

const POLL_MS = 30_000;

interface TaskRow {
  id: string;
  name: string;
  status: string;
  payment_value_kes?: number;
}

/**
 * Polls approval status every 30s for submitted tasks.
 * Shows in-app SMS-style alert when a task becomes approved.
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
      if (prev === 'submitted-for-approval' && t.status === 'approved' && !notifiedRef.current.has(t.id)) {
        notifiedRef.current.add(t.id);
        const amount = t.payment_value_kes ?? 0;
        Alert.alert(
          '✓ Task approved',
          `SMS: Task "${t.name}" approved! ${amount.toLocaleString()} KES pending settlement. Thank you!`
        );
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
            const data = await getFarmerTaskApprovalStatus(t.id);
            if (data.status === 'approved' && !notifiedRef.current.has(t.id)) {
              notifiedRef.current.add(t.id);
              const amount = t.payment_value_kes ?? 0;
              Alert.alert(
                '✓ Task approved',
                `SMS: Task "${t.name}" approved! ${amount.toLocaleString()} KES pending settlement. Thank you!`
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
