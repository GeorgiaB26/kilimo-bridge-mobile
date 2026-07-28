import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { getFarmerCount } from '../db/database';
import {
  getSupabaseSyncStatus,
  isSupabaseConfigured,
  syncAllToSupabase,
} from '../services/supabaseSync';

const router = Router();

router.get('/supabase/status', authenticate, requireRole('admin', 'super_admin'), async (_req: Request, res: Response) => {
  const status = await getSupabaseSyncStatus();
  res.json({
    ...status,
    local_farmers: getFarmerCount(),
  });
});

router.post('/supabase/sync', authenticate, requireRole('admin', 'super_admin'), async (_req: Request, res: Response) => {
  if (!isSupabaseConfigured()) {
    res.status(400).json({
      error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render.',
    });
    return;
  }

  const result = await syncAllToSupabase();
  if (!result.ok) {
    res.status(500).json(result);
    return;
  }
  res.json(result);
});

export default router;
