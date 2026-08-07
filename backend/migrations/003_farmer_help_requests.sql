-- Farmer help requests: message to assigned field agent (appears in agent Tasks tab)
CREATE TABLE IF NOT EXISTS farmer_help_requests (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_agent_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_farmer_help_requests_agent_open
  ON farmer_help_requests (assigned_agent_user_id, status)
  WHERE status = 'open';
