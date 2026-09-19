import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { createNotification } from './notificationService';
import { logAudit } from './auditService';
import { extractR2ObjectKey, resolveAttachmentPreviewUrl } from './r2StorageService';
import {
  SUPPORT_DESK_PHONE,
  SUPPORT_TICKET_CONTEXT,
  isSupportDeskUser,
} from '../../../shared/src/supportDesk';
import { isAgentRole } from '../../../shared/src/roles';

export type SupportTicketStatus = 'open' | 'resolved';

export interface SupportTicketSummary {
  thread_id: string;
  subject: string;
  status: SupportTicketStatus;
  created_by_user_id: string;
  requester_role: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_content: string | null;
  unread_count: number;
}

export interface SupportTicketMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  attachment_preview_url?: string | null;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
}

export async function ensureSupportTicketTables(): Promise<void> {
  await query(`
    ALTER TABLE message_thread_messages
      ADD COLUMN IF NOT EXISTS attachment_url TEXT
  `);
  await query(`
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
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_message_support_tickets_status_created
      ON message_support_tickets (status, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_message_support_tickets_created_by
      ON message_support_tickets (created_by_user_id, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_message_threads_context_type
      ON message_threads (context_type)
      WHERE context_type IS NOT NULL
  `);
}

export async function resolveSupportDeskUserId(): Promise<string> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM users
     WHERE phone_number = $1 AND status = 'active'
     LIMIT 1`,
    [SUPPORT_DESK_PHONE]
  );
  if (!row?.user_id) {
    throw new Error(
      `Support desk account not found (${SUPPORT_DESK_PHONE}). Ensure KB Support is seeded and active.`
    );
  }
  return row.user_id;
}

function canCreateTickets(role: string): boolean {
  return role === 'farmer' || isAgentRole(role);
}

function assertAttachmentKeys(keys: unknown): string[] {
  const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : [];
  const cleaned: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const key = extractR2ObjectKey(raw);
    if (!key) {
      throw new Error('Invalid support attachment key');
    }
    cleaned.push(key);
  }
  if (cleaned.length > 5) throw new Error('Maximum 5 photo attachments per message');
  return cleaned;
}

async function insertTicketMessage(
  threadId: string,
  senderId: string,
  content: string,
  attachmentUrl: string | null
): Promise<string> {
  const trimmed = content.trim() || (attachmentUrl ? 'Photo attachment' : '');
  if (!trimmed) throw new Error('Message cannot be empty');
  if (trimmed.length > 4000) throw new Error('Message must be 4000 characters or less');

  const messageId = uuidv4();
  await query(
    `INSERT INTO message_thread_messages (id, thread_id, sender_id, content, attachment_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [messageId, threadId, senderId, trimmed, attachmentUrl]
  );
  await query(
    `UPDATE message_threads SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [threadId]
  );
  return messageId;
}

async function notifyParticipants(
  threadId: string,
  senderId: string,
  senderName: string,
  preview: string,
  type: string,
  title: string
): Promise<void> {
  const recipients = await query<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants
     WHERE thread_id::text = $1::text AND user_id::text <> $2::text`,
    [threadId, senderId]
  );
  for (const recipient of recipients) {
    await createNotification({
      userId: recipient.user_id,
      title,
      message: `${senderName}: ${preview.slice(0, 120)}`,
      type,
      contextType: SUPPORT_TICKET_CONTEXT,
      contextId: threadId,
      actionUrl: `/support/tickets/${threadId}`,
    });
  }
}

export async function createSupportTicket(params: {
  userId: string;
  role: string;
  phoneNumber?: string | null;
  subject: string;
  description: string;
  attachmentKeys?: string[];
}): Promise<{ threadId: string; ticket: SupportTicketSummary }> {
  if (!canCreateTickets(params.role)) {
    throw new Error('Only farmers and field agents can create support tickets');
  }
  const subject = params.subject.trim();
  const description = params.description.trim();
  if (!subject) throw new Error('Subject is required');
  if (subject.length > 200) throw new Error('Subject must be 200 characters or less');
  if (!description) throw new Error('Description is required');
  if (description.length > 4000) throw new Error('Description must be 4000 characters or less');

  const attachments = assertAttachmentKeys(params.attachmentKeys);
  const supportUserId = await resolveSupportDeskUserId();
  if (supportUserId === params.userId) {
    throw new Error('Support desk cannot open a ticket with itself');
  }

  const requester = await queryOne<{ name: string; phone_number: string }>(
    `SELECT name, phone_number FROM users WHERE user_id::text = $1::text`,
    [params.userId]
  );
  if (!requester) throw new Error('User not found');

  const threadId = uuidv4();
  await query(
    `INSERT INTO message_threads (id, title, context_type, created_by, last_message_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [threadId, subject, SUPPORT_TICKET_CONTEXT, params.userId]
  );
  await query(
    `INSERT INTO message_thread_participants (thread_id, user_id) VALUES ($1, $2::text), ($1, $3::text)`,
    [threadId, params.userId, supportUserId]
  );
  await query(
    `INSERT INTO message_support_tickets (
      thread_id, subject, status, created_by_user_id, requester_role
    ) VALUES ($1, $2, 'open', $3, $4)`,
    [threadId, subject, params.userId, params.role]
  );

  const [firstAttachment, ...restAttachments] = attachments;
  await insertTicketMessage(threadId, params.userId, description, firstAttachment ?? null);
  for (const key of restAttachments) {
    await insertTicketMessage(threadId, params.userId, 'Photo attachment', key);
  }

  await notifyParticipants(
    threadId,
    params.userId,
    requester.name,
    subject,
    'support_ticket_created',
    'New support ticket'
  );

  await logAudit({
    userId: params.userId,
    userRole: params.role,
    action: 'support.ticket_created',
    category: 'system',
    resourceType: 'support_ticket',
    resourceId: threadId,
    details: { subject, attachment_count: attachments.length },
    success: true,
  });

  const ticket = await getSupportTicketForUser(threadId, params.userId, {
    userId: params.userId,
    phoneNumber: params.phoneNumber,
    role: params.role,
  });
  return { threadId, ticket };
}

export async function listSupportTicketsForUser(
  userId: string,
  opts: { userId: string; phoneNumber?: string | null; role: string; status?: SupportTicketStatus }
): Promise<SupportTicketSummary[]> {
  const desk = isSupportDeskUser({ userId: opts.userId, phoneNumber: opts.phoneNumber });
  const statusFilter = opts.status ?? null;

  if (desk) {
    return query<SupportTicketSummary>(
      `
      SELECT
        st.thread_id,
        st.subject,
        st.status,
        st.created_by_user_id,
        st.requester_role,
        u.name AS requester_name,
        u.phone_number AS requester_phone,
        st.resolved_at,
        st.resolved_by_user_id,
        st.created_at,
        st.updated_at,
        t.last_message_at,
        lm.content AS last_message_content,
        COALESCE((
          SELECT COUNT(*)::int
          FROM message_thread_messages m
          WHERE m.thread_id = st.thread_id
            AND m.sender_id::text <> $1::text
            AND NOT EXISTS (
              SELECT 1 FROM message_read_receipts r
              WHERE r.message_id = m.id AND r.user_id::text = $1::text
            )
        ), 0) AS unread_count
      FROM message_support_tickets st
      JOIN message_threads t ON t.id = st.thread_id
      JOIN users u ON u.user_id::text = st.created_by_user_id::text
      LEFT JOIN LATERAL (
        SELECT content FROM message_thread_messages
        WHERE thread_id = st.thread_id
        ORDER BY created_at DESC LIMIT 1
      ) lm ON TRUE
      WHERE ($2::text IS NULL OR st.status = $2)
      ORDER BY COALESCE(t.last_message_at, st.created_at) DESC
      `,
      [userId, statusFilter]
    );
  }

  return query<SupportTicketSummary>(
    `
    SELECT
      st.thread_id,
      st.subject,
      st.status,
      st.created_by_user_id,
      st.requester_role,
      u.name AS requester_name,
      u.phone_number AS requester_phone,
      st.resolved_at,
      st.resolved_by_user_id,
      st.created_at,
      st.updated_at,
      t.last_message_at,
      lm.content AS last_message_content,
      COALESCE((
        SELECT COUNT(*)::int
        FROM message_thread_messages m
        WHERE m.thread_id = st.thread_id
          AND m.sender_id::text <> $1::text
          AND NOT EXISTS (
            SELECT 1 FROM message_read_receipts r
            WHERE r.message_id = m.id AND r.user_id::text = $1::text
          )
      ), 0) AS unread_count
    FROM message_support_tickets st
    JOIN message_threads t ON t.id = st.thread_id
    JOIN users u ON u.user_id::text = st.created_by_user_id::text
    LEFT JOIN LATERAL (
      SELECT content FROM message_thread_messages
      WHERE thread_id = st.thread_id
      ORDER BY created_at DESC LIMIT 1
    ) lm ON TRUE
    WHERE st.created_by_user_id::text = $1::text
      AND ($2::text IS NULL OR st.status = $2)
    ORDER BY COALESCE(t.last_message_at, st.created_at) DESC
    `,
    [userId, statusFilter]
  );
}

async function assertTicketAccess(
  threadId: string,
  userId: string,
  opts: { userId: string; phoneNumber?: string | null; role: string }
): Promise<{ status: SupportTicketStatus; created_by_user_id: string }> {
  const ticket = await queryOne<{ status: SupportTicketStatus; created_by_user_id: string }>(
    `SELECT status, created_by_user_id FROM message_support_tickets WHERE thread_id::text = $1::text`,
    [threadId]
  );
  if (!ticket) throw new Error('Support ticket not found');

  const desk = isSupportDeskUser({ userId: opts.userId, phoneNumber: opts.phoneNumber });
  if (desk) return ticket;

  const participant = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM message_thread_participants
     WHERE thread_id::text = $1::text AND user_id::text = $2::text`,
    [threadId, userId]
  );
  if (!participant) throw new Error('Support ticket not found');
  return ticket;
}

export async function getSupportTicketForUser(
  threadId: string,
  userId: string,
  opts: { userId: string; phoneNumber?: string | null; role: string }
): Promise<SupportTicketSummary> {
  await assertTicketAccess(threadId, userId, opts);
  const row = await queryOne<SupportTicketSummary>(
    `
    SELECT
      st.thread_id,
      st.subject,
      st.status,
      st.created_by_user_id,
      st.requester_role,
      u.name AS requester_name,
      u.phone_number AS requester_phone,
      st.resolved_at,
      st.resolved_by_user_id,
      st.created_at,
      st.updated_at,
      t.last_message_at,
      lm.content AS last_message_content,
      COALESCE((
        SELECT COUNT(*)::int
        FROM message_thread_messages m
        WHERE m.thread_id = st.thread_id
          AND m.sender_id::text <> $2::text
          AND NOT EXISTS (
            SELECT 1 FROM message_read_receipts r
            WHERE r.message_id = m.id AND r.user_id::text = $2::text
          )
      ), 0) AS unread_count
    FROM message_support_tickets st
    JOIN message_threads t ON t.id = st.thread_id
    JOIN users u ON u.user_id::text = st.created_by_user_id::text
    LEFT JOIN LATERAL (
      SELECT content FROM message_thread_messages
      WHERE thread_id = st.thread_id
      ORDER BY created_at DESC LIMIT 1
    ) lm ON TRUE
    WHERE st.thread_id::text = $1::text
    `,
    [threadId, userId]
  );
  if (!row) throw new Error('Support ticket not found');
  return row;
}

export async function getSupportTicketMessages(
  threadId: string,
  userId: string,
  opts: { userId: string; phoneNumber?: string | null; role: string }
): Promise<{
  ticket: SupportTicketSummary;
  messages: SupportTicketMessage[];
  can_reply: boolean;
}> {
  const ticketMeta = await assertTicketAccess(threadId, userId, opts);
  const ticket = await getSupportTicketForUser(threadId, userId, opts);
  const desk = isSupportDeskUser({ userId: opts.userId, phoneNumber: opts.phoneNumber });
  const canReply = desk || ticketMeta.status === 'open';

  const messages = await query<SupportTicketMessage>(
    `
    SELECT m.id, m.thread_id, m.sender_id, m.content, m.attachment_url, m.created_at,
           u.name AS sender_name
    FROM message_thread_messages m
    JOIN users u ON u.user_id::text = m.sender_id::text
    WHERE m.thread_id::text = $1::text
    ORDER BY m.created_at ASC
    `,
    [threadId]
  );

  const withPreviews: SupportTicketMessage[] = [];
  for (const m of messages) {
    withPreviews.push({
      ...m,
      attachment_preview_url: await resolveAttachmentPreviewUrl(m.attachment_url),
      is_mine: String(m.sender_id) === String(userId),
    });
  }

  return { ticket, messages: withPreviews, can_reply: canReply };
}

export async function replyToSupportTicket(params: {
  threadId: string;
  userId: string;
  role: string;
  phoneNumber?: string | null;
  content: string;
  attachmentKeys?: string[];
}): Promise<SupportTicketMessage> {
  const ticket = await assertTicketAccess(params.threadId, params.userId, params);
  const desk = isSupportDeskUser({ userId: params.userId, phoneNumber: params.phoneNumber });
  if (!desk && ticket.status === 'resolved') {
    throw new Error('This support ticket is resolved. Start a new ticket to contact support again.');
  }

  const attachments = assertAttachmentKeys(params.attachmentKeys);
  const content = params.content.trim();
  if (!content && attachments.length === 0) {
    throw new Error('Message or photo is required');
  }

  const sender = await queryOne<{ name: string }>(
    `SELECT name FROM users WHERE user_id::text = $1::text`,
    [params.userId]
  );

  const [first, ...rest] = attachments;
  const messageId = await insertTicketMessage(
    params.threadId,
    params.userId,
    content || 'Photo attachment',
    first ?? null
  );
  for (const key of rest) {
    await insertTicketMessage(params.threadId, params.userId, 'Photo attachment', key);
  }

  await notifyParticipants(
    params.threadId,
    params.userId,
    sender?.name ?? 'Someone',
    content || 'Sent a photo',
    'support_ticket_reply',
    desk ? 'Support replied' : 'New reply on support ticket'
  );

  const row = await queryOne<SupportTicketMessage>(
    `
    SELECT m.id, m.thread_id, m.sender_id, m.content, m.attachment_url, m.created_at,
           u.name AS sender_name
    FROM message_thread_messages m
    JOIN users u ON u.user_id::text = m.sender_id::text
    WHERE m.id::text = $1::text
    `,
    [messageId]
  );
  return {
    ...row!,
    is_mine: true,
    attachment_preview_url: await resolveAttachmentPreviewUrl(row?.attachment_url),
  };
}

export async function resolveSupportTicket(params: {
  threadId: string;
  userId: string;
  phoneNumber?: string | null;
  role: string;
}): Promise<SupportTicketSummary> {
  if (!isSupportDeskUser({ userId: params.userId, phoneNumber: params.phoneNumber })) {
    throw new Error('Only the support desk can resolve tickets');
  }
  const ticket = await queryOne<{ status: string; created_by_user_id: string; subject: string }>(
    `SELECT status, created_by_user_id, subject FROM message_support_tickets WHERE thread_id::text = $1::text`,
    [params.threadId]
  );
  if (!ticket) throw new Error('Support ticket not found');
  if (ticket.status === 'resolved') {
    return getSupportTicketForUser(params.threadId, params.userId, params);
  }

  await query(
    `UPDATE message_support_tickets
     SET status = 'resolved', resolved_at = NOW(), resolved_by_user_id = $1, updated_at = NOW()
     WHERE thread_id::text = $2::text`,
    [params.userId, params.threadId]
  );

  await createNotification({
    userId: ticket.created_by_user_id,
    title: 'Support ticket resolved',
    message: `Your support request "${ticket.subject}" has been resolved.`,
    type: 'support_ticket_resolved',
    contextType: SUPPORT_TICKET_CONTEXT,
    contextId: params.threadId,
    actionUrl: `/support/tickets/${params.threadId}`,
  });

  await logAudit({
    userId: params.userId,
    userRole: params.role,
    action: 'support.ticket_resolved',
    category: 'system',
    resourceType: 'support_ticket',
    resourceId: params.threadId,
    details: { subject: ticket.subject },
    success: true,
  });

  return getSupportTicketForUser(params.threadId, params.userId, params);
}

export async function getSupportTicketStats(opts: {
  userId: string;
  phoneNumber?: string | null;
}): Promise<{ open: number; resolved: number; total: number; unread_open: number }> {
  if (!isSupportDeskUser({ userId: opts.userId, phoneNumber: opts.phoneNumber })) {
    throw new Error('Only the support desk can view ticket stats');
  }
  const row = await queryOne<{ open: number; resolved: number; total: number }>(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*)::int AS total
    FROM message_support_tickets
    `
  );
  const unread = await queryOne<{ c: number }>(
    `
    SELECT COUNT(*)::int AS c
    FROM message_support_tickets st
    WHERE st.status = 'open'
      AND EXISTS (
        SELECT 1 FROM message_thread_messages m
        WHERE m.thread_id = st.thread_id
          AND m.sender_id::text <> $1::text
          AND NOT EXISTS (
            SELECT 1 FROM message_read_receipts r
            WHERE r.message_id = m.id AND r.user_id::text = $1::text
          )
      )
    `,
    [opts.userId]
  );
  return {
    open: row?.open ?? 0,
    resolved: row?.resolved ?? 0,
    total: row?.total ?? 0,
    unread_open: unread?.c ?? 0,
  };
}
