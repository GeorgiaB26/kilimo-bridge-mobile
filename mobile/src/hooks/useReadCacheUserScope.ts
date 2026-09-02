import { useAuthStore } from '../store/authStore';

/** Stable scope so farmer/agent caches do not collide on a shared device. */
export function getReadCacheUserScope(): string {
  const user = useAuthStore.getState().user;
  return user?.farmerId || user?.userId || 'anon';
}

export function useReadCacheUserScope(): string {
  const user = useAuthStore((s) => s.user);
  return user?.farmerId || user?.userId || 'anon';
}
