import { Alert, Platform } from 'react-native';
import { API_BASE_URL } from '../constants';

type ApiErrorBody = {
  error?: string;
  message?: string;
  hint?: string;
  errors?: Array<string | { field?: string; error?: string; message?: string; value?: string }>;
};

function formatValidationErrors(errors: ApiErrorBody['errors']): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const parts = errors
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (!entry || typeof entry !== 'object') return '';
      const detail = (entry.error ?? entry.message ?? '').trim();
      if (!detail) return '';
      const field = entry.field?.trim();
      return field ? `${field}: ${detail}` : detail;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : null;
}

export function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    if ('response' in err) {
      const response = (err as {
        response?: { status?: number; data?: ApiErrorBody };
      }).response;
      if (response?.status === 429) {
        const base = response.data?.error ?? 'Too many login attempts. Please wait 15 minutes and try again.';
        return response.data?.hint ? `${base}\n\n${response.data.hint}` : base;
      }
      const data = response?.data;
      const fromErrors = formatValidationErrors(data?.errors);
      return data?.error ?? data?.message ?? fromErrors ?? fallback;
    }
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      const msg = (err as { message: string }).message;
      if (msg.includes('Network Error') || msg.includes('ECONNREFUSED')) {
        return `Cannot reach API at ${API_BASE_URL}. If this is the test site, wait ~30s for Render to wake up and try again.`;
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
