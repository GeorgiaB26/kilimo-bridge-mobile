import NetInfo from '@react-native-community/netinfo';
import { api } from '../api/client';
import { getLocalDb, isNativeOfflineCapable } from '../db/localDb';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { syncManager } from '../sync/SyncManager';
import { shouldQueueOffline } from '../sync/syncLogic';
import type { AdminFarmerSummary } from '../navigation/types';

const SYNC_MODE = process.env.EXPO_PUBLIC_SYNC_MODE ?? 'hybrid';
const PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): AdminFarmerSummary {
  return {
    farmer_id: row.farmer_id as string,
    name: row.name as string,
    phone_number: row.phone_number as string,
    country: (row.country as string) ?? 'Kenya',
    district: (row.district as string) ?? '',
    sub_county: row.sub_county as string | undefined,
    aggregation_center: row.aggregation_center as string | null,
    membership_group_name: (row.membership_group_name as string) ?? '',
    status: (row.status as string) ?? 'Active',
    kb_farmer_id: row.kb_farmer_id as string | undefined,
  };
}

export class FarmerRepository {
  async list(
    limit = PAGE_SIZE,
    offset = 0,
    accessToken?: string | null
  ): Promise<{ farmers: AdminFarmerSummary[]; total: number; source: 'api' | 'supabase' | 'local' | 'none' }> {
    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable);

    if (SYNC_MODE !== 'api' && online && isSupabaseConfigured() && accessToken) {
      const supabase = getSupabaseClient(accessToken);
      if (supabase) {
        try {
          const { data, error, count } = await supabase
            .from('farmers')
            .select('farmer_id, name, phone_number, country, district, sub_county, aggregation_center, membership_group_name, status, kb_farmer_id', { count: 'exact' })
            .eq('is_deleted', false)
            .order('name')
            .range(offset, offset + limit - 1);
          if (!error && data) {
            await this.cacheFarmersLocally(data);
            return { farmers: data.map((r) => mapRow(r as Record<string, unknown>)), total: count ?? data.length, source: 'supabase' };
          }
        } catch {
          // fall through
        }
      }
    }

    if (online) {
      try {
        const { data } = await api.get('/admin/farmers', { params: { limit, offset } });
        const farmers = (data.farmers ?? []).map((f: Record<string, unknown>) => mapRow(f));
        await this.cacheFarmersLocally(data.farmers ?? []);
        return { farmers, total: data.total ?? farmers.length, source: 'api' };
      } catch {
        // fall through to local
      }
    }

    if (isNativeOfflineCapable) {
      const local = await this.readLocalFarmers(limit, offset);
      if (local.farmers.length) return { ...local, source: 'local' };
    }

    return { farmers: [], total: 0, source: 'none' };
  }

  private async cacheFarmersLocally(rows: Record<string, unknown>[]): Promise<void> {
    if (!isNativeOfflineCapable || !rows.length) return;
    const db = await getLocalDb();
    if (!db) return;
    for (const r of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO farmers (
          farmer_id, key, name, phone_number, country, district, sub_county,
          aggregation_center, membership_group_name, status, kb_farmer_id, updated_at, pending_sync, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          r.farmer_id,
          r.key ?? '',
          r.name,
          r.phone_number,
          r.country ?? '',
          r.district ?? '',
          r.sub_county ?? '',
          r.aggregation_center,
          r.membership_group_name ?? '',
          r.status ?? 'Active',
          r.kb_farmer_id,
          r.updated_at ?? new Date().toISOString(),
        ]
      );
    }
  }

  private async readLocalFarmers(limit: number, offset: number) {
    const db = await getLocalDb();
    if (!db) return { farmers: [], total: 0 };
    const totalRow = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM farmers WHERE is_deleted = 0'
    );
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM farmers WHERE is_deleted = 0 ORDER BY name LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return {
      farmers: rows.map(mapRow),
      total: totalRow?.c ?? rows.length,
    };
  }

  async upsertFarmer(payload: Record<string, unknown>, accessToken?: string | null): Promise<void> {
    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable);
    const farmerId = payload.farmer_id as string;

    if (shouldQueueOffline(online, SYNC_MODE) || !online) {
      await this.writeLocalFarmer(payload, true);
      await syncManager.queueUpsert('farmers', farmerId, { ...payload, updated_at: new Date().toISOString() });
      return;
    }

    if (isSupabaseConfigured() && accessToken) {
      const supabase = getSupabaseClient(accessToken);
      if (supabase) {
        const { error } = await supabase.from('farmers').upsert({ ...payload, updated_at: new Date().toISOString() });
        if (!error) {
          await this.writeLocalFarmer(payload, false);
          return;
        }
      }
    }

    await api.post('/farmers/register', payload);
    await this.writeLocalFarmer(payload, false);
  }

  private async writeLocalFarmer(payload: Record<string, unknown>, pending: boolean): Promise<void> {
    if (!isNativeOfflineCapable) return;
    const db = await getLocalDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO farmers (
        farmer_id, key, name, phone_number, country, district, sub_county,
        aggregation_center, membership_group_name, status, kb_farmer_id,
        updated_at, pending_sync, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        payload.farmer_id,
        payload.key ?? '',
        payload.name,
        payload.phone_number,
        payload.country ?? '',
        payload.district ?? '',
        payload.sub_county ?? '',
        payload.aggregation_center,
        payload.membership_group_name ?? '',
        payload.status ?? 'Active',
        payload.kb_farmer_id,
        payload.updated_at ?? new Date().toISOString(),
        pending ? 1 : 0,
      ]
    );
  }
}

export const farmerRepository = new FarmerRepository();
