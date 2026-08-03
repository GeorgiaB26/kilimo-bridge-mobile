-- Personal tasks created by field agents (not program farmer_tasks)
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'not_started',
  assigned_farmer_ids TEXT,
  reminder_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks(due_date);
