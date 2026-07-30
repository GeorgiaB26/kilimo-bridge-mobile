/**
 * App Supabase client — NEW Kilimo Bridge app database only.
 * DO NOT use admin/Loveable Supabase credentials here.
 *
 * Env: EXPO_PUBLIC_APP_SUPABASE_URL, EXPO_PUBLIC_APP_SUPABASE_ANON_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const appUrl = process.env.EXPO_PUBLIC_APP_SUPABASE_URL ?? '';
const appAnonKey = process.env.EXPO_PUBLIC_APP_SUPABASE_ANON_KEY ?? '';

let baseClient: SupabaseClient | null = null;

export function isAppSupabaseConfigured(): boolean {
  return Boolean(appUrl && appAnonKey);
}

/** Kilimo JWT passed as Authorization header for RLS (set Supabase JWT secret = JWT_SECRET). */
export function getAppSupabaseClient(accessToken?: string | null): SupabaseClient | null {
  if (!isAppSupabaseConfigured()) return null;

  if (!accessToken) {
    if (!baseClient) {
      baseClient = createClient(appUrl, appAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return baseClient;
  }

  return createClient(appUrl, appAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function checkAppSupabaseReachable(): Promise<boolean> {
  const sb = getAppSupabaseClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from('cooperatives').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
