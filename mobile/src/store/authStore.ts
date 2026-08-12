import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllSessionData } from '../utils/session';

import type { UserRole } from '../constants/roles';
import {
  isAdminRole as sharedIsAdminRole,
  isAgentRole as sharedIsAgentRole,
  isBankingRole as sharedIsBankingRole,
  isPlatformAdminRole,
  isSuperAdminRole,
  isRegionalAdminRole,
  isBankingAdminRole,
  isBankingAgentRole,
} from '../../shared/src/roles';

export type { UserRole };

export interface AuthUser {
  userId: string;
  phoneNumber: string;
  name: string;
  role: UserRole;
  farmerId?: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  aggregationCenterId?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

const TOKEN_KEY = 'kilimo_token';
const USER_KEY = 'kilimo_user';

/** Treat token as expired this many seconds before JWT exp (clock skew). */
const JWT_EXPIRY_SKEW_SECONDS = 60;

function isUnauthorizedError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'response' in err &&
    (err as { response?: { status?: number } }).response?.status === 401
  );
}

/** Decode JWT payload and return true if missing/unreadable exp or already past exp. */
function isJwtExpiredOrInvalid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) return true;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob !== 'function') return true;
    const json = atob(padded);
    const claims = JSON.parse(json) as { exp?: unknown };
    if (typeof claims.exp !== 'number') return true;
    return claims.exp * 1000 <= Date.now() + JWT_EXPIRY_SKEW_SECONDS * 1000;
  } catch {
    return true;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: async (token, user) => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    await clearAllSessionData();
    const { setAuthToken } = await import('../api/client');
    setAuthToken(null);
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  loadStoredAuth: async () => {
    try {
      const [tokenEntry, userJson] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
      const storedToken = tokenEntry[1];
      const storedUserRaw = userJson[1];
      if (!storedToken || !storedUserRaw) {
        set({ isLoading: false });
        return;
      }

      let storedUser: AuthUser;
      try {
        storedUser = JSON.parse(storedUserRaw) as AuthUser;
      } catch {
        await clearAllSessionData();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (!storedUser?.userId || !storedUser?.role) {
        await clearAllSessionData();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Expired/unreadable JWT: require a fresh login (do not trust offline indefinitely).
      if (isJwtExpiredOrInvalid(storedToken)) {
        await clearAllSessionData();
        const { setAuthToken } = await import('../api/client');
        setAuthToken(null);
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const { setAuthToken, fetchMe } = await import('../api/client');
      setAuthToken(storedToken);
      // Offline-first: trust local session immediately so cold start works without network.
      set({
        token: storedToken,
        user: storedUser,
        isAuthenticated: true,
        isLoading: false,
      });

      try {
        const { user } = await fetchMe();
        if (user) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
          set({ user: user as AuthUser });
        }
      } catch (err) {
        const { isLikelyConnectivityError } = await import(
          '../services/offlineOutboxHandlers'
        );
        // Keep local session on connectivity/timeout/5xx; only clear on real auth rejection.
        if (isLikelyConnectivityError(err)) {
          return;
        }
        if (isUnauthorizedError(err)) {
          await clearAllSessionData();
          setAuthToken(null);
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
        // Non-401 server/client errors: keep persisted session (same as offline read_cache).
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));

export const isAdminRole = sharedIsAdminRole;
export const isAgentRole = sharedIsAgentRole;
export const isBankingRole = sharedIsBankingRole;
export { isPlatformAdminRole, isSuperAdminRole, isRegionalAdminRole, isBankingAdminRole, isBankingAgentRole };

export function canManageUsers(role: UserRole): boolean {
  return isPlatformAdminRole(role) || isSuperAdminRole(role) || isRegionalAdminRole(role);
}

export function canManageElevatedUsers(role: UserRole): boolean {
  return isPlatformAdminRole(role);
}
