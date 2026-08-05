const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const LARGE_ENTRY_BYTES = 50_000;

/**
 * Web-only: prevent localStorage quota errors from oversized kilimo_sync* keys.
 */
export function startKilimoStorageCleanup(): () => void {
  if (typeof localStorage === 'undefined') {
    return () => {};
  }

  const run = () => {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (!key.includes('kilimo_sync')) continue;
        const data = localStorage.getItem(key);
        if (data && data.length > LARGE_ENTRY_BYTES) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore quota / access errors during cleanup
    }
  };

  run();
  const interval = setInterval(run, CLEANUP_INTERVAL_MS);
  return () => clearInterval(interval);
}
