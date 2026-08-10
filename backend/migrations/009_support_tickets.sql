-- Support tickets: specialized message_threads (context_type = 'support_ticket')
-- Side table keeps normal chat threads untouched.
-- Named message_support_tickets because public.support_tickets already exists
-- (legacy Lovable portal schema: ticket_id/category/message — not messaging threads).

ALTER TABLE message_thread_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

CREATE TABLE IF NOT EXISTS message_support_tickets (
  thread_id TEXT PRIMARY KEY REFERENCES message_threads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by_user_id TEXT NOT NULL,
  requester_role TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_support_tickets_status_created
  ON message_support_tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_support_tickets_created_by
  ON message_support_tickets (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_threads_context_type
  ON message_threads (context_type)
  WHERE context_type IS NOT NULL;
