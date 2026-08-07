/**
 * App-root connectivity sync: when the device returns online, drain the sync outbox.
 * On-focus / manual Push remain as additional safety nets.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { getAuthToken } from '../api/client';
import { listOutbox, resetOutboxForManualRetry } from './offlineOutbox';
import {
  processReadyOutbox,
  type ProcessReadyOutboxResult,
} from './offlineOutboxProcessor';

export function isNetInfoOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  // null means unknown — treat as online so we don't miss a reconnect window
  if (state.isInternetReachable === false) return false;
  return state.isConnected === true || state.isInternetReachable === true;
}

let syncInFlight: Promise<ProcessReadyOutboxResult> | null = null;
let unsubscribe: (() => void) | null = null;
let lastOnline: boolean | null = null;
/** Resolves when the latest reconnect-triggered sync finishes (for proofs). */
let lastReconnectSync: Promise<ProcessReadyOutboxResult> | null = null;

/**
 * Same work the NetInfo offline→online transition runs.
 * Exported so Node proof scripts can invoke it without toggling real connectivity.
 *
 * Clears auto-retry backoff for queued rows first — after an offline submit the
 * failed attempt would otherwise leave nextAttemptAt ~30s out, and processReadyOutbox
 * would no-op on reconnect.
 */
export async function syncOutboxAfterReconnect(
  limit = 20
): Promise<ProcessReadyOutboxResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    if (!getAuthToken()) {
      return { processed: 0, synced: 0, failed: 0, needsReview: 0, results: [] };
    }

    const queued = await listOutbox({ includeSynced: false });
    for (const item of queued) {
      if (
        item.status === 'synced' ||
        item.status === 'uploading' ||
        item.status === 'needs_review'
      ) {
        continue;
      }
      await resetOutboxForManualRetry(item.id);
    }

    return processReadyOutbox(limit);
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

function handleNetInfoChange(state: NetInfoState): void {
  const online = isNetInfoOnline(state);
  const wasOnline = lastOnline;
  lastOnline = online;

  // First event: seed state only (do not treat app start as a reconnect).
  if (wasOnline === null) return;
  if (!wasOnline && online) {
    lastReconnectSync = syncOutboxAfterReconnect().catch((err) => {
      // Background sync — surface errors via outbox lastError / Push UI
      return {
        processed: 0,
        synced: 0,
        failed: 0,
        needsReview: 0,
        results: [{ ok: false as const, error: String(err) }],
      };
    });
  }
}

/** Idempotent — safe to call from App mount. */
export function startOutboxConnectivitySync(): () => void {
  if (unsubscribe) return stopOutboxConnectivitySync;

  lastOnline = null;
  unsubscribe = NetInfo.addEventListener(handleNetInfoChange);

  // Seed current connectivity without triggering a sync.
  void NetInfo.fetch()
    .then((state) => {
      if (lastOnline === null) {
        lastOnline = isNetInfoOnline(state);
      }
    })
    .catch(() => {
      if (lastOnline === null) lastOnline = true;
    });

  return stopOutboxConnectivitySync;
}

export function stopOutboxConnectivitySync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  lastOnline = null;
}

/** Test helper: seed listener as offline (after startOutboxConnectivitySync). */
export function __setConnectivityOnlineForTests(online: boolean): void {
  lastOnline = online;
}

/**
 * Test helper: fire the same offline→online path NetInfo would.
 * Returns the sync promise started by the listener.
 */
export function __emitConnectivityRestoredForTests(): Promise<ProcessReadyOutboxResult> {
  lastOnline = false;
  handleNetInfoChange({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: {
      isConnectionExpensive: false,
      ssid: null,
      bssid: null,
      strength: null,
      ipAddress: null,
      subnet: null,
      frequency: null,
      linkSpeed: null,
      rxLinkSpeed: null,
      txLinkSpeed: null,
    },
  } as NetInfoState);
  return lastReconnectSync ?? Promise.resolve({ processed: 0, synced: 0, failed: 0, needsReview: 0, results: [] });
}