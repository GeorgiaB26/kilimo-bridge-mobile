import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllSessionData } from '../utils/session';

import type { UserRole } from '../constants/roles';

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
      if (!storedToken || !userJson[1]) {
        set({ isLoading: false });
        return;
      }
      const { setAuthToken, fetchMe } = await import('../api/client');
      setAuthToken(storedToken);
      try {
        const { user } = await fetchMe();
        set({
          token: storedToken,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        await clearAllSessionData();
        setAuthToken(null);
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));

export function isAdminRole(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function isAgentRole(role: UserRole): boolean {
  return role === 'agent';
}

export function isBankingRole(role: UserRole): boolean {
  return role === 'banking';
}
