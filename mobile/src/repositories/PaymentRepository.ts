import { getAppSupabaseClient, isAppSupabaseConfigured } from '../lib/appSupabase';
import { getLocalDb, isNativeOfflineCapable } from '../db/localDb';
import { syncManager } from '../sync/SyncManager';

export interface AppPaymentRow {
  id: string;
  farmer_id: string;
  project_id?: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method?: string | null;
  processed_at?: string | null;
  created_at?: string;
}

export class PaymentRepository {
  async listForFarmer(farmerId: string, accessToken?: string | null): Promise<{
    payments: AppPaymentRow[];
    source: 'app-supabase' | 'local' | 'none';
  }> {
    if (isAppSupabaseConfigured() && accessToken) {
      const sb = getAppSupabaseClient(accessToken);
      if (sb) {
        const { data, error } = await sb
          .from('payments')
          .select('id, farmer_id, project_id, amount, currency, status, payment_method, processed_at, created_at')
          .eq('farmer_id', farmerId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false });
        if (!error && data) {
          return { payments: data as AppPaymentRow[], source: 'app-supabase' };
        }
      }
    }
    return { payments: [], source: 'none' };
  }

  async listQueue(accessToken?: string | null): Promise<{
    payments: AppPaymentRow[];
    source: 'app-supabase' | 'none';
  }> {
    if (!isAppSupabaseConfigured() || !accessToken) {
      return { payments: [], source: 'none' };
    }
    const sb = getAppSupabaseClient(accessToken);
    if (!sb) return { payments: [], source: 'none' };

    const { data, error } = await sb
      .from('payments')
      .select('id, farmer_id, project_id, amount, currency, status, payment_method, processed_at, created_at')
      .in('status', ['pending', 'processing'])
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error || !data) return { payments: [], source: 'none' };
    return { payments: data as AppPaymentRow[], source: 'app-supabase' };
  }

  async markProcessing(paymentId: string, processedBy: string, accessToken?: string | null): Promise<boolean> {
    const payload = {
      id: paymentId,
      status: 'processing',
      processed_by: processedBy,
      updated_at: new Date().toISOString(),
    };

    if (isNativeOfflineCapable && !accessToken) {
      await syncManager.queueUpsert('payments', paymentId, payload);
      return true;
    }

    const sb = getAppSupabaseClient(accessToken);
    if (!sb) return false;
    const { error } = await sb.from('payments').update(payload).eq('id', paymentId);
    return !error;
  }
}

export const paymentRepository = new PaymentRepository();
