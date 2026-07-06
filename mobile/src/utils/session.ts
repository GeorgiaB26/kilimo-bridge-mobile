import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'kilimo_token';
const USER_KEY = 'kilimo_user';

/** Wipe all saved login data (browser refresh does NOT do this automatically). */
export async function clearAllSessionData(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);

  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    // AsyncStorage web backend keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('kilimo') || key.includes(TOKEN_KEY) || key.includes(USER_KEY))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}
