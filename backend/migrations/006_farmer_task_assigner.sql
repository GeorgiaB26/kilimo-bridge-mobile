-- Track who assigned a task to a farmer (shown on farmer tasks portal)
ALTER TABLE farmer_tasks
  ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT REFERENCES users(user_id);
