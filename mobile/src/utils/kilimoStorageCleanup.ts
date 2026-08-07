/** Native — outbox uses SQLite; no localStorage quota cleanup needed. */
export function startKilimoStorageCleanup(): () => void {
  return () => {};
}
