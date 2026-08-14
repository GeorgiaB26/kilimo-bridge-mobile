/**
 * App-root connectivity sync: when the device returns online, drain the sync outbox
 * and warm role-relevant READ caches. On-focus / manual Push remain as additional
 * safety nets for the outbox.
 *
 * Warm runs fully in the background — never awaited by outbox or UI.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { getAuthToken } from '../api/client';
import { listOutbox, resetOutboxForManualRetry } from './offlineOutbox';
import {
  processReadyOutbox,
  type ProcessReadyOutboxResult,
} from './offlineOutboxProcessor';
import {
  warmReadCachesForCurrentUser,
  type WarmReadCacheReason,
} from './readCacheWarmup';

const IS_DEV =
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export function isNetInfoOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  // null means unknown — treat as online so we don't miss a reconnect window
  if (state.isInternetReachable === false) return false;
  return state.isConnected === true || state.isInternetReachable === true;
}

let syncInFlight: Promise<ProcessReadyOutboxResult> | null = null;
let unsubscribeNetInfo: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
let lastOnline: boolean | null = null;
let appState: AppStateStatus = AppState.currentState;
/** True after we have handled the launch-time online seed (warm-once). */
let didLaunchWarmAttempt = false;
/** Resolves when the latest reconnect-triggered sync finishes (for proofs). */
let lastReconnectSync: Promise<ProcessReadyOutboxResult> | null = null;

/** Fire-and-forget warm — never blocks outbox or callers. */
function fireWarmInBackground(
  options: { force?: boolean; reason: WarmReadCacheReason }
): void {
  if (IS_DEV) {
    console.log(`[read-cache warm] trigger (${options.reason})`, {
      force: options.force === true,
    });
  }
  void warmReadCachesForCurrentUser(options).catch((err) => {
    if (IS_DEV) {
      console.warn(`[read-cache warm] trigger failed (${options.reason})`, err);
    }
  });
}

/**
 * Schedule a warm if the device appears online.
 * Used after setAuth / loadStoredAuth; respects throttle (no force).
 */
export function scheduleReadCacheWarmIfOnline(
  reason: WarmReadCacheReason = 'auth'
): void {
  void (async () => {
    try {
      let online = lastOnline;
      if (online === null) {
        const state = await NetInfo.fetch();
        online = isNetInfoOnline(state);
        if (lastOnline === null) lastOnline = online;
      }
      if (!online) {
        if (IS_DEV) {
          console.log(`[read-cache warm] schedule skipped (${reason}): device offline`);
        }
        return;
      }
      fireWarmInBackground({ reason });
    } catch (err) {
      if (IS_DEV) {
        console.warn(`[read-cache warm] schedule failed (${reason})`, err);
      }
    }
  })();
}

function maybeWarmOnLaunchIfOnline(online: boolean): void {
  if (didLaunchWarmAttempt) return;
  didLaunchWarmAttempt = true;
  if (online) {
    fireWarmInBackground({ reason: 'launch' });
  }
}

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

  // First event: seed state + launch warm if already online (outbox still skips).
  if (wasOnline === null) {
    maybeWarmOnLaunchIfOnline(online);
    return;
  }
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
    // Reconnect: bypass throttle so stale caches refresh after a gap.
    fireWarmInBackground({ force: true, reason: 'reconnect' });
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  const was = appState;
  appState = nextState;
  const becameActive =
    (was === 'inactive' || was === 'background') && nextState === 'active';
  if (!becameActive) return;
  if (lastOnline === true) {
    fireWarmInBackground({ reason: 'foreground' });
    return;
  }
  if (lastOnline === false) return;
  // Connectivity not seeded yet — check once, still respect throttle.
  void NetInfo.fetch()
    .then((state) => {
      const online = isNetInfoOnline(state);
      if (lastOnline === null) lastOnline = online;
      if (online) fireWarmInBackground({ reason: 'foreground' });
    })
    .catch((err) => {
      if (IS_DEV) {
        console.warn('[read-cache warm] foreground schedule failed', err);
      }
    });
}

/** Idempotent — safe to call from App mount. */
export function startOutboxConnectivitySync(): () => void {
  if (unsubscribeNetInfo) return stopOutboxConnectivitySync;

  lastOnline = null;
  didLaunchWarmAttempt = false;
  appState = AppState.currentState;

  unsubscribeNetInfo = NetInfo.addEventListener(handleNetInfoChange);
  appStateSub = AppState.addEventListener('change', handleAppStateChange);

  // Seed current connectivity without treating it as a reconnect for outbox.
  void NetInfo.fetch()
    .then((state) => {
      const online = isNetInfoOnline(state);
      if (lastOnline === null) {
        lastOnline = online;
        maybeWarmOnLaunchIfOnline(online);
      }
    })
    .catch(() => {
      if (lastOnline === null) {
        lastOnline = true;
        maybeWarmOnLaunchIfOnline(true);
      }
    });

  return stopOutboxConnectivitySync;
}

export function stopOutboxConnectivitySync(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  lastOnline = null;
  didLaunchWarmAttempt = false;
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
