import { useEffect } from 'react';
import { startOutboxConnectivitySync } from '../services/outboxConnectivitySync';

/** Mount once at the app root to auto-drain the outbox on offline→online. */
export function useOutboxConnectivitySync(): void {
  useEffect(() => startOutboxConnectivitySync(), []);
}
