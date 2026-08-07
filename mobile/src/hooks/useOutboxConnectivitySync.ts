import { useEffect } from 'react';
import { startOutboxConnectivitySync } from '../services/outboxConnectivitySync';
import { startKilimoStorageCleanup } from '../utils/kilimoStorageCleanup';

/** Mount once at the app root to auto-drain the outbox on offline→online. */
export function useOutboxConnectivitySync(): void {
  useEffect(() => {
    const stopSync = startOutboxConnectivitySync();
    const stopCleanup = startKilimoStorageCleanup();
    return () => {
      stopSync();
      stopCleanup();
    };
  }, []);
}
