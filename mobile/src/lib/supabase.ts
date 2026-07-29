import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** Read-only or JWT-authenticated Supabase client. */
export function getSupabaseClient(accessToken?: string | null): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;

  if (!accessToken) {
    if (!client) {
      client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return client;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export interface CloudSyncMeta {
  last_full_sync_at: string | null;
  last_sync_status: string | null;
  farmers_count: number | null;
}

export async function fetchCloudSyncMeta(): Promise<CloudSyncMeta | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.from('sync_meta').select('last_full_sync_at, last_sync_status, farmers_count').eq('id', 'default').maybeSingle();
  if (error || !data) return null;
  return data as CloudSyncMeta;
}

export async function fetchCloudFarmerCount(): Promise<number | null> {
  const meta = await fetchCloudSyncMeta();
  if (meta?.farmers_count != null) return meta.farmers_count;
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { count, error } = await sb.from('farmers').select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? null;
}

export interface CloudFarmerRow {
  farmer_id: string;
  name: string;
  phone_number: string;
  district: string;
  sub_county: string;
  membership_group_name?: string | null;
  status: string;
}

export async function fetchCloudFarmers(limit = 50, offset = 0): Promise<CloudFarmerRow[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('farmers')
    .select('farmer_id, name, phone_number, district, sub_county, membership_group_name, status')
    .order('name')
    .range(offset, offset + limit - 1);
  if (error || !data) return [];
  return data as CloudFarmerRow[];
}

export async function fetchCloudFarmerByPhone(phone: string): Promise<CloudFarmerRow | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('farmers')
    .select('farmer_id, name, phone_number, district, sub_county, membership_group_name, status')
    .eq('phone_number', phone)
    .maybeSingle();
  if (error || !data) return null;
  return data as CloudFarmerRow;
}

export async function checkSupabaseReachable(): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from('sync_meta').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
