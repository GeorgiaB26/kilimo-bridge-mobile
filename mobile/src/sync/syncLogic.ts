/**
 * Pure sync logic — testable without React Native.
 */
export type ConflictResolution = 'local-wins' | 'remote-wins' | 'pending';

export function pickWinner(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined
): ConflictResolution {
  const local = localUpdatedAt ? Date.parse(localUpdatedAt) : 0;
  const remote = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : 0;
  if (!local && !remote) return 'remote-wins';
  if (!remote) return 'local-wins';
  if (!local) return 'remote-wins';
  if (local >= remote) return 'local-wins';
  return 'remote-wins';
}

export function shouldQueueOffline(isOnline: boolean, syncMode: string): boolean {
  if (syncMode === 'api') return false;
  return !isOnline;
}

export function mergeFarmerRows<T extends { updated_at?: string | null }>(
  local: T | null,
  remote: T | null
): { row: T | null; resolution: ConflictResolution } {
  if (!local && !remote) return { row: null, resolution: 'remote-wins' };
  if (!local) return { row: remote, resolution: 'remote-wins' };
  if (!remote) return { row: local, resolution: 'local-wins' };
  const resolution = pickWinner(local.updated_at, remote.updated_at);
  return { row: resolution === 'local-wins' ? local : remote, resolution };
}
