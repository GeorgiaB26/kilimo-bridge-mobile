import { api } from './client';
import {
  checkSupabaseReachable,
  fetchCloudFarmerCount,
  fetchCloudFarmers,
  fetchCloudSyncMeta,
  isSupabaseConfigured,
  type CloudFarmerRow,
  type CloudSyncMeta,
} from '../lib/supabase';

export interface DataSourceStatus {
  apiOnline: boolean;
  supabaseConfigured: boolean;
  supabaseOnline: boolean;
  localFarmerCount?: number;
  cloudFarmerCount?: number | null;
  cloudSyncMeta?: CloudSyncMeta | null;
}

/** Prefer Express API (SQLite source of truth); fall back to Supabase mirror when API is offline. */
export async function getFarmerListHybrid(limit = 50, offset = 0): Promise<{
  farmers: CloudFarmerRow[];
  source: 'api' | 'supabase' | 'none';
  total?: number;
}> {
  try {
    const { data } = await api.get('/farmers', { params: { limit, offset } });
    const farmers = (data.farmers ?? []).map((f: Record<string, unknown>) => ({
      farmer_id: f.farmer_id as string,
      name: f.name as string,
      phone_number: f.phone_number as string,
      district: f.district as string,
      sub_county: f.sub_county as string,
      membership_group_name: f.membership_group_name as string | null,
      status: f.status as string,
    }));
    return { farmers, source: 'api', total: data.total };
  } catch {
    if (!isSupabaseConfigured()) return { farmers: [], source: 'none' };
    const farmers = await fetchCloudFarmers(limit, offset);
    return { farmers, source: farmers.length ? 'supabase' : 'none' };
  }
}

export async function getDataSourceStatus(): Promise<DataSourceStatus> {
  let apiOnline = false;
  let localFarmerCount: number | undefined;
  try {
    const { data } = await api.get('/farmers', { params: { limit: 1 } });
    apiOnline = true;
    localFarmerCount = data.total;
  } catch {
    apiOnline = false;
  }

  const supabaseConfigured = isSupabaseConfigured();
  const supabaseOnline = supabaseConfigured ? await checkSupabaseReachable() : false;
  const cloudFarmerCount = supabaseOnline ? await fetchCloudFarmerCount() : null;
  const cloudSyncMeta = supabaseOnline ? await fetchCloudSyncMeta() : null;

  return {
    apiOnline,
    supabaseConfigured,
    supabaseOnline,
    localFarmerCount,
    cloudFarmerCount,
    cloudSyncMeta,
  };
}
