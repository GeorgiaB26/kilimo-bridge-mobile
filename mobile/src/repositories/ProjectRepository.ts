import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export class ProjectRepository {
  async listActive(accessToken?: string | null) {
    if (!isSupabaseConfigured() || !accessToken) {
      return { projects: [], source: 'none' as const };
    }
    const supabase = getSupabaseClient(accessToken);
    if (!supabase) return { projects: [], source: 'none' as const };

    const { data, error } = await supabase
      .from('program_projects')
      .select('id, name, program_id, status, budget_kes, start_date, end_date')
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('name');

    if (error || !data) return { projects: [], source: 'none' as const };
    return { projects: data, source: 'supabase' as const };
  }
}

export const projectRepository = new ProjectRepository();
