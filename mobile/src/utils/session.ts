import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'kilimo_token';
const USER_KEY = 'kilimo_user';

/** Web localStorage keys for offline read cache — must survive login/logout session wipes. */
function isReadCacheStorageKey(key: string): boolean {
  return key.includes('kilimo_read_cache');
}

/** Auth session keys only (not outbox / read_cache / registration queues). */
function isAuthSessionStorageKey(key: string): boolean {
  if (isReadCacheStorageKey(key)) return false;
  return (
    key.includes(TOKEN_KEY) ||
    key.includes(USER_KEY) ||
    key.endsWith(':kilimo_token') ||
    key.endsWith(':kilimo_user')
  );
}

/**
 * Wipe saved login credentials.
 * Does NOT clear offline read_cache (or other offline queues) — those are keyed by userScope
 * and must survive web quick-login so warm caches remain available offline.
 */
export async function clearAllSessionData(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);

  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    // AsyncStorage web backend mirrors keys into localStorage — only strip auth, never read_cache.
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isAuthSessionStorageKey(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}
