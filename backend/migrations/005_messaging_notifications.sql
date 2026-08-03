-- Messaging threads and notification preferences (TEXT ids match existing schema)

CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  context_type TEXT,
  context_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS message_thread_participants (
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id TEXT NOT NULL REFERENCES message_thread_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_threads_last_message ON message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_thread_messages_thread ON message_thread_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_thread_participants_user ON message_thread_participants(user_id);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  notify_task_assigned BOOLEAN NOT NULL DEFAULT TRUE,
  notify_farmer_registered BOOLEAN NOT NULL DEFAULT TRUE,
  notify_help_requests BOOLEAN NOT NULL DEFAULT TRUE,
  notify_payment_updates BOOLEAN NOT NULL DEFAULT TRUE,
  notify_messages BOOLEAN NOT NULL DEFAULT TRUE,
  messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  task_assignments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  payment_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  verification_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
