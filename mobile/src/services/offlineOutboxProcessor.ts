/**
 * Outbox processor — claims items, runs registered handlers, updates status.
 */
import {
  claimNextOutboxItem,
  claimOutboxItem,
  getOutboxItem,
  markOutboxFailed,
  markOutboxNeedsReview,
  markOutboxSynced,
  reclaimStaleUploading,
  resetOutboxForManualRetry,
} from './offlineOutbox';
import {
  ensureOutboxHandlersRegistered,
  formatOutboxHandlerError,
  getOutboxHandler,
  isLikelyConnectivityError,
} from './offlineOutboxHandlers';
import { isOutboxNeedsReviewError } from './offlineOutboxExpected';
import type { OutboxItem } from './offlineOutboxTypes';

export type ProcessOutboxResult =
  | { ok: true; item: OutboxItem; data?: unknown }
  | {
      ok: false;
      item?: OutboxItem;
      error: string;
      skipped?: boolean;
      connectivity?: boolean;
      needsReview?: boolean;
    };

export interface ProcessReadyOutboxResult {
  processed: number;
  synced: number;
  failed: number;
  needsReview: number;
  results: ProcessOutboxResult[];
}

async function runClaimedItem(claimed: OutboxItem): Promise<ProcessOutboxResult> {
  ensureOutboxHandlersRegistered();
  const handler = getOutboxHandler(claimed.actionType);
  if (!handler) {
    const error = `No outbox handler registered for action_type=${claimed.actionType}`;
    await markOutboxFailed(claimed.id, error);
    return { ok: false, item: claimed, error };
  }

  try {
    const data = await handler(claimed);
    const synced = await markOutboxSynced(claimed.id);
    return { ok: true, item: synced ?? { ...claimed, status: 'synced' }, data };
  } catch (err: unknown) {
    if (isOutboxNeedsReviewError(err)) {
      const reviewed = await markOutboxNeedsReview(claimed.id, err.message);
      return {
        ok: false,
        item: reviewed ?? { ...claimed, status: 'needs_review', lastError: err.message },
        error: err.message,
        needsReview: true,
      };
    }
    const error = formatOutboxHandlerError(err);
    const failed = await markOutboxFailed(claimed.id, error);
    return {
      ok: false,
      item: failed ?? claimed,
      error,
      connectivity: isLikelyConnectivityError(err) || isLikelyConnectivityError(error),
    };
  }
}

/**
 * Process one item by id (manual Push).
 * Resets terminal/backoff scheduling first so the claim succeeds.
 * Items in needs_review are not re-pushed (user must dismiss after reviewing).
 */
export async function processOutboxItem(id: string): Promise<ProcessOutboxResult> {
  ensureOutboxHandlersRegistered();
  await reclaimStaleUploading();

  const existing = await getOutboxItem(id);
  if (!existing) {
    return { ok: false, error: 'Outbox item not found', skipped: true };
  }
  if (existing.status === 'needs_review') {
    return {
      ok: false,
      item: existing,
      error: existing.lastError ?? 'Needs your review — dismiss after checking the live record',
      needsReview: true,
      skipped: true,
    };
  }

  await resetOutboxForManualRetry(id);
  const claimed = await claimOutboxItem(id);
  if (!claimed) {
    return { ok: false, error: 'Outbox item not found or not claimable', skipped: true };
  }
  return runClaimedItem(claimed);
}

/**
 * Process up to `limit` items that are ready for automatic sync.
 */
export async function processReadyOutbox(limit = 10): Promise<ProcessReadyOutboxResult> {
  ensureOutboxHandlersRegistered();
  await reclaimStaleUploading();

  const results: ProcessOutboxResult[] = [];
  let synced = 0;
  let failed = 0;
  let needsReview = 0;

  for (let i = 0; i < limit; i += 1) {
    const claimed = await claimNextOutboxItem();
    if (!claimed) break;
    const result = await runClaimedItem(claimed);
    results.push(result);
    if (result.ok) synced += 1;
    else if (result.needsReview) needsReview += 1;
    else failed += 1;
  }

  return {
    processed: results.length,
    synced,
    failed,
    needsReview,
    results,
  };
}
