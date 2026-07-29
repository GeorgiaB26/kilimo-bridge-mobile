/** Pilot SMS stub — logs messages until Safaricom/Twilio is wired. */
import { query, queryOne } from '../db/database';

export async function getAdminNotifyPhone(): Promise<string | null> {
  const row = await queryOne<{ phone_number: string }>(`
    SELECT phone_number FROM users
    WHERE role::text IN ('admin', 'super_admin', 'platform_admin') AND phone_number IS NOT NULL
    ORDER BY CASE role::text WHEN 'platform_admin' THEN 0 WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
    LIMIT 1
  `);
  return row?.phone_number ?? null;
}

export async function getUserNotifications(userId: string, limit = 50) {
  return query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export function sendSms(phone: string, message: string): { sent: boolean; pilot: boolean } {
  const pilot = process.env.PILOT_OTP === 'true' || process.env.NODE_ENV !== 'production';
  console.log(`[SMS${pilot ? ' pilot' : ''}] ${phone}: ${message}`);
  return { sent: true, pilot };
}
