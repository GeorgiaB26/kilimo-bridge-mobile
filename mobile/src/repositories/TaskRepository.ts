import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { getLocalDb, isNativeOfflineCapable } from '../db/localDb';
import { syncManager } from '../sync/SyncManager';

export class TaskRepository {
  async listForFarmer(farmerId: string, accessToken?: string | null) {
    if (isSupabaseConfigured() && accessToken) {
      const supabase = getSupabaseClient(accessToken);
      if (supabase) {
        const { data, error } = await supabase
          .from('farmer_tasks')
          .select('id, task_id, farmer_id, program_project_id, status, notes, updated_at')
          .eq('farmer_id', farmerId)
          .eq('is_deleted', false);
        if (!error && data) return { tasks: data, source: 'supabase' as const };
      }
    }

    if (isNativeOfflineCapable) {
      const db = await getLocalDb();
      if (db) {
        const rows = await db.getAllAsync(
          'SELECT * FROM farmer_tasks WHERE farmer_id = ? AND is_deleted = 0',
          [farmerId]
        );
        if (rows.length) return { tasks: rows, source: 'local' as const };
      }
    }

    return { tasks: [], source: 'none' as const };
  }

  async updateTaskStatus(
    taskRowId: string,
    farmerId: string,
    status: string,
    accessToken?: string | null
  ): Promise<void> {
    const payload = {
      id: taskRowId,
      farmer_id: farmerId,
      status,
      updated_at: new Date().toISOString(),
    };

    if (isNativeOfflineCapable) {
      const db = await getLocalDb();
      if (db) {
        await db.runAsync(
          `INSERT OR REPLACE INTO farmer_tasks (id, farmer_id, status, updated_at, pending_sync, is_deleted)
           VALUES (?, ?, ?, ?, 1, 0)`,
          [taskRowId, farmerId, status, payload.updated_at]
        );
      }
    }

    await syncManager.queueUpsert('farmer_tasks', taskRowId, payload);
  }
}

export const taskRepository = new TaskRepository();
