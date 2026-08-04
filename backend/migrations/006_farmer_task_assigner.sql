-- Track who assigned a task to a farmer (shown on farmer tasks portal)
-- TEXT column without FK — users.user_id may be UUID on Supabase.
ALTER TABLE farmer_tasks
  ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT;
