/** In-app notifications and pilot SMS stub. */
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  context_type?: string | null;
  context_id?: string | null;
  action_url?: string | null;
  priority?: string | null;
  created_at: string;
}

export async function getAdminNotifyPhone(): Promise<string | null> {
  const row = await queryOne<{ phone_number: string }>(`
    SELECT phone_number FROM users
    WHERE role::text IN ('admin', 'super_admin', 'platform_admin') AND phone_number IS NOT NULL
    ORDER BY CASE role::text WHEN 'platform_admin' THEN 0 WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
    LIMIT 1
  `);
  return row?.phone_number ?? null;
}

function mapNotificationRow(row: Record<string, unknown>): AppNotification {
  const readVal = row.read ?? row.is_read ?? false;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    message: String(row.message),
    type: String(row.type ?? 'info'),
    is_read: Boolean(readVal),
    context_type: row.context_type as string | null | undefined,
    context_id: row.context_id as string | null | undefined,
    action_url: row.action_url as string | null | undefined,
    priority: row.priority as string | null | undefined,
    created_at: String(row.created_at),
  };
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
  unreadOnly = false
): Promise<AppNotification[]> {
  const rows = await query<Record<string, unknown>>(
    unreadOnly
      ? `SELECT * FROM notifications WHERE user_id = $1 AND COALESCE(read, FALSE) = FALSE
         ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapNotificationRow);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id = $1 AND COALESCE(read, FALSE) = FALSE`,
    [userId]
  );
  return row?.count ?? 0;
}

export async function createNotification(input: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  contextType?: string;
  contextId?: string;
  actionUrl?: string;
  priority?: string;
}): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO notifications (
      id, user_id, title, message, type, context_type, context_id, action_url, priority, read
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)`,
    [
      id,
      input.userId,
      input.title,
      input.message,
      input.type ?? 'info',
      input.contextType ?? null,
      input.contextId ?? null,
      input.actionUrl ?? null,
      input.priority ?? 'normal',
    ]
  );
  return id;
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id`,
    [notificationId, userId]
  );
  return Boolean(row);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await query(`UPDATE notifications SET read = TRUE WHERE user_id = $1 AND COALESCE(read, FALSE) = FALSE`, [
    userId,
  ]);
}

export function sendSms(phone: string, message: string): { sent: boolean; pilot: boolean } {
  const pilot = process.env.PILOT_OTP === 'true' || process.env.NODE_ENV !== 'production';
  console.log(`[SMS${pilot ? ' pilot' : ''}] ${phone}: ${message}`);
  return { sent: true, pilot };
}
