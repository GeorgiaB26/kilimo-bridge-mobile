-- Log agent_task status changes (farmer start, agent updates).
CREATE TABLE IF NOT EXISTS task_activity_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  farmer_id TEXT,
  field_agent_user_id TEXT,
  status_before TEXT,
  status_after TEXT NOT NULL,
  action TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_farmer ON task_activity_log(farmer_id);
