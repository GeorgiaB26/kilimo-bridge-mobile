import NetInfo from '@react-native-community/netinfo';
import { getLocalDb, isNativeOfflineCapable } from '../db/localDb';
import { getAppSupabaseClient, isAppSupabaseConfigured } from '../lib/appSupabase';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { pickWinner, type ConflictResolution } from './syncLogic';
import type { SyncState } from '../db/localSchema';

function randomId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type Listener = (state: SyncState) => void;

const SYNC_MODE = process.env.EXPO_PUBLIC_SYNC_MODE ?? 'hybrid';

export class SyncManager {
  private listeners: Listener[] = [];
  private state: SyncState = {
    status: 'idle',
    message: 'Ready',
    lastSyncAt: null,
    pendingCount: 0,
  };
  private accessToken: string | null = null;
  private netUnsubscribe: (() => void) | null = null;
  private syncing = false;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async start(): Promise<void> {
    if (this.netUnsubscribe) return;
    this.netUnsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      if (online) {
        this.runSync('network-restored');
      } else {
        this.emit({ status: 'offline', message: 'Offline — changes queued for sync' });
      }
    });
    const net = await NetInfo.fetch();
    if (net.isConnected) {
      await this.runSync('startup');
    } else {
      this.emit({ status: 'offline', message: 'Offline — using local cache' });
    }
  }

  stop(): void {
    if (this.netUnsubscribe) {
      this.netUnsubscribe();
      this.netUnsubscribe = null;
    }
  }

  async runSync(reason: string): Promise<void> {
    if (SYNC_MODE === 'api') return;
    if ((!isSupabaseConfigured() && !isAppSupabaseConfigured()) || !this.accessToken) return;
    if (this.syncing) return;

    this.syncing = true;
    this.emit({ status: 'syncing', message: `Syncing (${reason})…` });

    try {
      const pending = await this.getPendingCount();
      await this.pushQueue();
      await this.pullFarmers();
      await this.logSync('synced', `OK: ${reason}`);
      this.emit({
        status: 'synced',
        message: 'In sync',
        lastSyncAt: new Date().toISOString(),
        pendingCount: await this.getPendingCount(),
      });
      if (pending > 0) {
        this.emit({ message: `Sync complete (${pending} items uploaded)` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      await this.logSync('error', msg);
      this.emit({ status: 'error', message: `Sync error: ${msg}` });
    } finally {
      this.syncing = false;
    }
  }

  private async getPendingCount(): Promise<number> {
    if (!isNativeOfflineCapable) return 0;
    const db = await getLocalDb();
    if (!db) return 0;
    const row = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM sync_queue'
    );
    return row?.c ?? 0;
  }

  private async logSync(status: string, message: string): Promise<void> {
    if (!isNativeOfflineCapable) return;
    const db = await getLocalDb();
    if (!db) return;
    await db.runAsync(
      'INSERT INTO sync_log (id, status, message, created_at) VALUES (?, ?, ?, ?)',
      [randomId(), status, message, new Date().toISOString()]
    );
  }

  private async pushQueue(): Promise<void> {
    if (!isNativeOfflineCapable) return;
    const db = await getLocalDb();
    const supabase = isAppSupabaseConfigured()
      ? getAppSupabaseClient(this.accessToken)
      : getSupabaseClient(this.accessToken);
    if (!db || !supabase) return;

    const rows = await db.getAllAsync<{
      id: string;
      table_name: string;
      record_id: string;
      operation: string;
      payload: string;
    }>('SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 100');

    for (const row of rows) {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const { error } = await supabase.from(row.table_name).upsert(payload);
      if (error) {
        await db.runAsync(
          'UPDATE sync_queue SET sync_error = ?, last_sync_attempt = ?, retry_count = retry_count + 1 WHERE id = ?',
          [error.message, new Date().toISOString(), row.id]
        );
        throw new Error(`${row.table_name}: ${error.message}`);
      }
      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
    }
  }

  private async pullFarmers(): Promise<void> {
    if (!isNativeOfflineCapable) return;
    const db = await getLocalDb();
    const supabase = isAppSupabaseConfigured()
      ? getAppSupabaseClient(this.accessToken)
      : getSupabaseClient(this.accessToken);
    if (!db || !supabase) return;

    const isApp = isAppSupabaseConfigured();
    const selectFields = isApp
      ? 'id, name, phone, country, district, sub_county, village, membership_type, status, profile_photo_url, updated_at, is_deleted, activated, verified_by_name, verified_at'
      : 'farmer_id, key, name, phone_number, country, district, sub_county, aggregation_center, membership_group_name, status, kb_farmer_id, updated_at, is_deleted';

    const { data, error } = await supabase
      .from('farmers')
      .select(selectFields)
      .eq('is_deleted', false)
      .order('name')
      .limit(500);

    if (error) throw new Error(error.message);
    if (!data?.length) return;

    for (const remote of data) {
      const farmerId = isApp ? (remote.id as string) : (remote.farmer_id as string);
      const local = await db.getFirstAsync<{ updated_at: string; pending_sync: number }>(
        'SELECT updated_at, pending_sync FROM farmers WHERE farmer_id = ?',
        [farmerId]
      );

      if (local?.pending_sync) {
        const resolution = pickWinner(local.updated_at, remote.updated_at as string);
        if (resolution === 'local-wins') continue;
      }

      await db.runAsync(
        `INSERT OR REPLACE INTO farmers (
          farmer_id, key, name, phone_number, country, district, sub_county,
          aggregation_center, membership_group_name, status, kb_farmer_id,
          updated_at, pending_sync, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          farmerId,
          isApp ? farmerId : (remote.key ?? ''),
          remote.name,
          isApp ? remote.phone : remote.phone_number,
          remote.country ?? '',
          remote.district ?? '',
          isApp ? remote.sub_county ?? '' : remote.sub_county ?? '',
          isApp ? null : remote.aggregation_center,
          isApp ? remote.membership_type ?? '' : remote.membership_group_name,
          remote.status ?? 'Active',
          isApp ? null : remote.kb_farmer_id,
          remote.updated_at ?? new Date().toISOString(),
        ]
      );
    }
  }

  async queueUpsert(tableName: string, recordId: string, payload: Record<string, unknown>): Promise<void> {
    if (!isNativeOfflineCapable) return;
    const db = await getLocalDb();
    if (!db) return;

    await db.runAsync(
      `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (?, ?, ?, 'upsert', ?, ?)`,
      [randomId(), tableName, recordId, JSON.stringify(payload), new Date().toISOString()]
    );
    this.emit({ pendingCount: await this.getPendingCount() });
  }

  resolveConflict(
    localUpdatedAt: string | null,
    remoteUpdatedAt: string | null
  ): ConflictResolution {
    return pickWinner(localUpdatedAt, remoteUpdatedAt);
  }
}

export const syncManager = new SyncManager();
