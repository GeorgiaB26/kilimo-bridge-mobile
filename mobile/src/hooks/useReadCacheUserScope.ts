import { useAuthStore } from '../store/authStore';

/** Stable scope so farmer/agent caches do not collide on a shared device. */
export function useReadCacheUserScope(): string {
  const user = useAuthStore((s) => s.user);
  return user?.farmerId || user?.userId || 'anon';
}
