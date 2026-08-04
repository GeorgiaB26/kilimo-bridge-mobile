/**
 * Optimistic-concurrency helpers for mutation outbox items.
 * Compare a live server snapshot to the expected prior state captured at enqueue.
 */
export class OutboxNeedsReviewError extends Error {
  readonly code = 'OUTBOX_NEEDS_REVIEW' as const;

  constructor(message: string) {
    super(message);
    this.name = 'OutboxNeedsReviewError';
  }
}

export function isOutboxNeedsReviewError(err: unknown): err is OutboxNeedsReviewError {
  if (err instanceof OutboxNeedsReviewError) return true;
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === 'OUTBOX_NEEDS_REVIEW';
}

export type ExpectedFieldMismatch = {
  field: string;
  expected: unknown;
  actual: unknown;
};

function formatValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

/**
 * Throws OutboxNeedsReviewError when any expected field differs from current.
 * `expected` keys must exist on the live record with the same value.
 */
export function assertExpected(
  current: Record<string, unknown>,
  expected: Record<string, unknown>,
  options?: { label?: string }
): void {
  const mismatches: ExpectedFieldMismatch[] = [];
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actual = current[field];
    if (!valuesEqual(actual, expectedValue)) {
      mismatches.push({ field, expected: expectedValue, actual });
    }
  }
  if (mismatches.length === 0) return;

  const parts = mismatches.map(
    (m) => `${m.field}: expected ${formatValue(m.expected)}, now ${formatValue(m.actual)}`
  );
  const label = options?.label?.trim() || 'Record';
  throw new OutboxNeedsReviewError(
    `${label} changed since this action was queued (${parts.join('; ')}). ` +
      `Do not apply blindly — open the live record and decide again.`
  );
}

/** Short UI label for outbox status (pending/failed vs needs_review). */
export function outboxStatusUserLabel(status: string): string {
  switch (status) {
    case 'needs_review':
      return 'Needs your review';
    case 'pending':
      return 'Waiting to sync';
    case 'uploading':
      return 'Syncing…';
    case 'failed':
      return 'Sync failed';
    case 'synced':
      return 'Synced';
    default:
      return status;
  }
}
