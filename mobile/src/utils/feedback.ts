import { Alert, Platform } from 'react-native';

export function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    if ('response' in err) {
      const data = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
      return data?.error ?? data?.message ?? fallback;
    }
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      const msg = (err as { message: string }).message;
      if (msg.includes('Network Error') || msg.includes('ECONNREFUSED')) {
        return 'Cannot reach backend. Is it running on http://localhost:3001?';
      }
      return msg;
    }
  }
  return fallback;
}

/** Alert that also works on web (RN Alert is unreliable in browsers). */
export function showMessage(title: string, message: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
