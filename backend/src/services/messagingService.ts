import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { createNotification } from './notificationService';
import { getProjectManagerUserForAgent } from './agentDashboardService';
import { isAgentRole } from '../../../shared/src/roles';

export interface MessageThreadSummary {
  id: string;
  title: string | null;
  last_message_at: string | null;
  other_user_id: string;
  other_user_name: string;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
}

export interface NotificationSettings {
  user_id: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  notify_task_assigned: boolean;
  notify_farmer_registered: boolean;
  notify_help_requests: boolean;
  notify_payment_updates: boolean;
  notify_messages: boolean;
  messages_enabled: boolean;
  task_assignments_enabled: boolean;
  payment_updates_enabled: boolean;
  verification_updates_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_enabled: boolean;
}

export async function ensureMessagingTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id TEXT PRIMARY KEY,
      title TEXT,
      context_type TEXT,
      context_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS message_thread_participants (
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (thread_id, user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS message_thread_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS message_read_receipts (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )
  `);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_message_threads_last_message ON message_threads(last_message_at DESC)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_message_thread_messages_thread ON message_thread_messages(thread_id, created_at)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_message_thread_participants_user ON message_thread_participants(user_id)'
  );
  await query(`
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
    )
  `);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS notify_help_requests BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS notify_payment_updates BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS messages_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS task_assignments_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS payment_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS verification_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE`);

  // Extend notifications table if columns missing (safe on Postgres)
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_type TEXT`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_id TEXT`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE`);
}

async function findDirectThread(userId: string, otherUserId: string): Promise<string | null> {
  const row = await queryOne<{ thread_id: string }>(
    `
    SELECT p1.thread_id
    FROM message_thread_participants p1
    JOIN message_thread_participants p2
      ON p2.thread_id = p1.thread_id AND p2.user_id::text = $2
    WHERE p1.user_id::text = $1
    LIMIT 1
    `,
    [userId, otherUserId]
  );
  return row?.thread_id ?? null;
}

/** Resolve users.user_id from user_id or agents.agent_id (avoids uuid = text errors). */
export async function resolveMessagingUserId(recipientId: string): Promise<string> {
  const trimmed = recipientId.trim();
  if (!trimmed) throw new Error('Recipient not found');

  const byUser = await queryOne<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM users WHERE user_id::text = $1`,
    [trimmed]
  );
  if (byUser) return byUser.user_id;

  const byAgent = await queryOne<{ user_id: string }>(
    `
    SELECT u.user_id::text AS user_id
    FROM agents a
    JOIN users u ON u.user_id = a.user_id
    WHERE a.agent_id::text = $1
    `,
    [trimmed]
  );
  if (byAgent) return byAgent.user_id;

  throw new Error('Recipient not found');
}

export async function getOrCreateDirectThread(
  userId: string,
  otherUserId: string,
  title?: string
): Promise<string> {
  const resolvedOther = await resolveMessagingUserId(otherUserId);
  if (userId === resolvedOther) {
    throw new Error('Cannot message yourself');
  }
  const existing = await findDirectThread(userId, resolvedOther);
  if (existing) return existing;

  const other = await queryOne<{ name: string }>(
    'SELECT name FROM users WHERE user_id::text = $1',
    [resolvedOther]
  );
  if (!other) throw new Error('Recipient not found');

  const threadId = uuidv4();
  await query(
    `INSERT INTO message_threads (id, title, created_by, last_message_at)
     VALUES ($1, $2, $3, NOW())`,
    [threadId, title ?? other.name, userId]
  );
  await query(
    `INSERT INTO message_thread_participants (thread_id, user_id) VALUES ($1, $2::text), ($1, $3::text)`,
    [threadId, userId, resolvedOther]
  );
  return threadId;
}

export async function listThreadsForUser(
  userId: string,
  search?: string,
  role?: string,
  region?: string,
  district?: string
): Promise<MessageThreadSummary[]> {
  const rows = await query<{
    id: string;
    title: string | null;
    last_message_at: string | null;
    other_user_id: string;
    other_user_name: string;
    last_message_content: string | null;
    last_message_sender_id: string | null;
    unread_count: number;
  }>(
    `
    SELECT
      t.id,
      t.title,
      t.last_message_at,
      ou.user_id AS other_user_id,
      ou.name AS other_user_name,
      lm.content AS last_message_content,
      lm.sender_id AS last_message_sender_id,
      COALESCE(
        (
          SELECT COUNT(*)::int
          FROM message_thread_messages m
          WHERE m.thread_id = t.id
            AND m.sender_id::text <> $1::text
            AND NOT EXISTS (
              SELECT 1 FROM message_read_receipts r
              WHERE r.message_id = m.id AND r.user_id::text = $1::text
            )
        ),
        0
      ) AS unread_count
    FROM message_threads t
    JOIN message_thread_participants mp ON mp.thread_id = t.id AND mp.user_id::text = $1::text
    JOIN message_thread_participants op
      ON op.thread_id = t.id AND op.user_id::text <> $1::text
    JOIN users ou ON ou.user_id::text = op.user_id::text
    LEFT JOIN LATERAL (
      SELECT content, sender_id
      FROM message_thread_messages
      WHERE thread_id = t.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON TRUE
  WHERE ($2::text IS NULL OR ou.name ILIKE '%' || $2 || '%' OR COALESCE(t.title, '') ILIKE '%' || $2 || '%')
    ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
    `,
    [userId, search?.trim() || null]
  );

  if (isAgentRole(role ?? '')) {
    const allowed = await listAgentMessageableUsers(userId, region, district);
    const allowedIds = new Set(allowed.map((u) => u.userId));
    return rows.filter((r) => allowedIds.has(String(r.other_user_id)));
  }

  return rows;
}

export async function getThreadMessages(
  threadId: string,
  userId: string
): Promise<{ messages: ThreadMessage[]; otherUser: { id: string; name: string } | null }> {
  const participant = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants WHERE thread_id::text = $1::text AND user_id::text = $2::text`,
    [threadId, userId]
  );
  if (!participant) throw new Error('Thread not found');

  const other = await queryOne<{ user_id: string; name: string }>(
    `
    SELECT u.user_id, u.name
    FROM message_thread_participants p
    JOIN users u ON u.user_id::text = p.user_id::text
    WHERE p.thread_id::text = $1::text AND p.user_id::text <> $2::text
    LIMIT 1
    `,
    [threadId, userId]
  );

  const messages = await query<ThreadMessage>(
    `
    SELECT m.id, m.thread_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
    FROM message_thread_messages m
    JOIN users u ON u.user_id::text = m.sender_id::text
    WHERE m.thread_id::text = $1::text
    ORDER BY m.created_at ASC
    `,
    [threadId]
  );

  return {
    messages: messages.map((m) => ({
      ...m,
      is_mine: String(m.sender_id) === String(userId),
    })),
    otherUser: other ? { id: other.user_id, name: other.name } : null,
  };
}

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const participant = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants WHERE thread_id::text = $1::text AND user_id::text = $2::text`,
    [threadId, userId]
  );
  if (!participant) throw new Error('Thread not found');

  const unread = await query<{ id: string }>(
    `
    SELECT m.id
    FROM message_thread_messages m
    WHERE m.thread_id::text = $1::text
      AND m.sender_id::text <> $2::text
      AND NOT EXISTS (
        SELECT 1 FROM message_read_receipts r
        WHERE r.message_id = m.id AND r.user_id::text = $2::text
      )
    `,
    [threadId, userId]
  );

  for (const row of unread) {
    await query(
      `INSERT INTO message_read_receipts (message_id, user_id) VALUES ($1, $2)
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [row.id, userId]
    );
  }
}

export async function sendThreadMessage(
  threadId: string,
  senderId: string,
  content: string
): Promise<ThreadMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  if (trimmed.length > 2000) throw new Error('Message must be 2000 characters or less');

  const participant = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants WHERE thread_id::text = $1::text AND user_id::text = $2::text`,
    [threadId, senderId]
  );
  if (!participant) throw new Error('Thread not found');

  const sender = await queryOne<{ name: string }>(
    'SELECT name FROM users WHERE user_id = $1',
    [senderId]
  );

  const messageId = uuidv4();
  await query(
    `INSERT INTO message_thread_messages (id, thread_id, sender_id, content)
     VALUES ($1, $2, $3, $4)`,
    [messageId, threadId, senderId, trimmed]
  );
  await query(
    `UPDATE message_threads SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [threadId]
  );

  const recipients = await query<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants WHERE thread_id::text = $1::text AND user_id::text <> $2::text`,
    [threadId, senderId]
  );

  for (const recipient of recipients) {
    const settings = await getNotificationSettings(recipient.user_id);
    if (settings.notify_messages && settings.messages_enabled) {
      await createNotification({
        userId: recipient.user_id,
        title: 'New message',
        message: `${sender?.name ?? 'Someone'}: ${trimmed.slice(0, 120)}`,
        type: 'message_received',
        contextType: 'message_thread',
        contextId: threadId,
        actionUrl: `/messages/${threadId}`,
      });
    }
  }

  const row = await queryOne<ThreadMessage>(
  `
    SELECT m.id, m.thread_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
    FROM message_thread_messages m
    JOIN users u ON u.user_id::text = m.sender_id::text
    WHERE m.id::text = $1::text
    `,
    [messageId]
  );

  return { ...row!, is_mine: true };
}

/** Field agents may only message their project manager and farmers they registered. */
export async function listAgentMessageableUsers(
  agentUserId: string,
  region?: string,
  district?: string
): Promise<Array<{ userId: string; name: string; role: string }>> {
  const users: Array<{ userId: string; name: string; role: string }> = [];

  const pm = await getProjectManagerUserForAgent(region, district);
  if (pm) {
    users.push({
      userId: pm.user_id,
      name: `${pm.name} (Project Manager)`,
      role: 'project_manager',
    });
  }

  const agent = await queryOne<{ agent_id: string }>(
    `SELECT agent_id::text AS agent_id FROM agents WHERE user_id::text = $1`,
    [agentUserId]
  );
  if (agent?.agent_id) {
    const farmerRows = await query<{ user_id: string; name: string }>(
      `
      SELECT DISTINCT u.user_id::text AS user_id, f.name
      FROM farmers f
      JOIN users u ON u.farmer_id::text = f.farmer_id::text
      WHERE f.registered_by_agent_id::text = $1
      ORDER BY f.name
      `,
      [agent.agent_id]
    );
    for (const f of farmerRows) {
      if (!users.some((u) => u.userId === f.user_id)) {
        users.push({ userId: f.user_id, name: f.name, role: 'farmer' });
      }
    }
  }

  return users;
}

export async function agentCanMessageRecipient(
  agentUserId: string,
  recipientId: string,
  region?: string,
  district?: string
): Promise<boolean> {
  const resolved = await resolveMessagingUserId(recipientId);
  const allowed = await listAgentMessageableUsers(agentUserId, region, district);
  return allowed.some((u) => u.userId === resolved);
}

export async function listMessageableUsers(
  userId: string,
  role: string,
  farmerId?: string,
  district?: string,
  region?: string
): Promise<Array<{ userId: string; name: string; role: string }>> {
  const users: Array<{ userId: string; name: string; role: string }> = [];

  if (role === 'farmer' && farmerId) {
    const { getFarmerSupportContacts } = await import('./farmerHelpRequestService');
    const contacts = await getFarmerSupportContacts(farmerId);
    if (contacts.fieldAgent?.userId) {
      const resolved = await resolveMessagingUserId(contacts.fieldAgent.userId);
      users.push({
        userId: resolved,
        name: contacts.fieldAgent.name,
        role: 'field_agent',
      });
    }
    const techSupport = await queryOne<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM users
       WHERE role::text IN ('platform_admin', 'super_admin')
       ORDER BY CASE role::text WHEN 'platform_admin' THEN 0 WHEN 'super_admin' THEN 1 ELSE 2 END
       LIMIT 1`
    );
    if (techSupport && !users.some((u) => u.userId === techSupport.user_id)) {
      users.push({
        userId: String(techSupport.user_id),
        name: 'Tech Support',
        role: 'tech_support',
      });
    }
    return users;
  }

  if (role === 'agent' || role === 'field_officer') {
    return listAgentMessageableUsers(userId, region, district);
  }

  const all = await query<{ user_id: string; name: string; role: string }>(
    `SELECT user_id, name, role::text AS role FROM users WHERE user_id <> $1 ORDER BY name LIMIT 30`,
    [userId]
  );
  return all.map((r) => ({ userId: r.user_id, name: r.name, role: r.role }));
}

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `
    SELECT COUNT(*)::int AS count
    FROM message_thread_messages m
    JOIN message_thread_participants p
      ON p.thread_id::text = m.thread_id::text AND p.user_id::text = $1::text
    WHERE m.sender_id::text <> $1::text
      AND NOT EXISTS (
        SELECT 1 FROM message_read_receipts r
        WHERE r.message_id = m.id AND r.user_id::text = $1::text
      )
    `,
    [userId]
  );
  return row?.count ?? 0;
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  let row = await queryOne<Record<string, unknown>>(
    'SELECT * FROM notification_settings WHERE user_id = $1',
    [userId]
  );
  if (!row) {
    await query('INSERT INTO notification_settings (user_id) VALUES ($1)', [userId]);
    row = await queryOne<Record<string, unknown>>(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [userId]
    );
  }
  return normalizeNotificationSettings(row ?? { user_id: userId });
}

function normalizeNotificationSettings(row: Record<string, unknown>): NotificationSettings {
  const payment =
    row.notify_payment_updates ?? row.notify_payment_ready ?? row.payment_updates_enabled ?? true;
  const verification =
    row.verification_updates_enabled ?? row.notify_verification_updates ?? true;
  const messages = row.messages_enabled ?? row.notify_messages ?? true;

  return {
    user_id: String(row.user_id ?? ''),
    push_enabled: Boolean(row.push_enabled ?? true),
    sms_enabled: Boolean(row.sms_enabled ?? false),
    email_enabled: Boolean(row.email_enabled ?? false),
    notify_task_assigned: Boolean(row.notify_task_assigned ?? true),
    notify_farmer_registered: Boolean(row.notify_farmer_registered ?? true),
    notify_help_requests: Boolean(row.notify_help_requests ?? true),
    notify_payment_updates: Boolean(payment),
    notify_messages: Boolean(messages),
    messages_enabled: Boolean(messages),
    task_assignments_enabled: Boolean(row.task_assignments_enabled ?? row.notify_task_assigned ?? true),
    payment_updates_enabled: Boolean(payment),
    verification_updates_enabled: Boolean(verification),
    quiet_hours_start: (row.quiet_hours_start as string | null) ?? null,
    quiet_hours_end: (row.quiet_hours_end as string | null) ?? null,
    quiet_hours_enabled: Boolean(row.quiet_hours_enabled ?? false),
  };
}

export async function updateNotificationSettings(
  userId: string,
  patch: Partial<Record<keyof NotificationSettings, boolean | string | null>>
): Promise<NotificationSettings> {
  await getNotificationSettings(userId);
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const allowed = [
    'push_enabled',
    'sms_enabled',
    'email_enabled',
    'notify_task_assigned',
    'notify_farmer_registered',
    'notify_help_requests',
    'notify_payment_updates',
    'notify_messages',
    'messages_enabled',
    'task_assignments_enabled',
    'payment_updates_enabled',
    'verification_updates_enabled',
    'quiet_hours_start',
    'quiet_hours_end',
    'quiet_hours_enabled',
  ] as const;

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(patch[key]);
      idx += 1;
      // Keep legacy Supabase/Lovable columns in sync when present
      if (key === 'notify_payment_updates' || key === 'payment_updates_enabled') {
        fields.push(`notify_payment_ready = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
      if (key === 'verification_updates_enabled') {
        fields.push(`notify_verification_updates = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
      if (key === 'messages_enabled' || key === 'notify_messages') {
        if (key === 'messages_enabled') {
          fields.push(`notify_messages = $${idx}`);
          values.push(patch[key]);
          idx += 1;
        } else {
          fields.push(`messages_enabled = $${idx}`);
          values.push(patch[key]);
          idx += 1;
        }
      }
    }
  }

  if (fields.length > 0) {
    fields.push(`updated_at = NOW()`);
    values.push(userId);
    await query(
      `UPDATE notification_settings SET ${fields.join(', ')} WHERE user_id = $${idx}`,
      values
    );
  }

  return getNotificationSettings(userId);
}
