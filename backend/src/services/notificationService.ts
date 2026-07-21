/** Pilot SMS stub — logs messages until Safaricom/Twilio is wired. */
import { db } from '../db/database';

export function getAdminNotifyPhone(): string | null {
  const row = db.prepare(`
    SELECT phone_number FROM users
    WHERE role IN ('admin', 'super_admin') AND phone_number IS NOT NULL
    ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END
    LIMIT 1
  `).get() as { phone_number?: string } | undefined;
  return row?.phone_number ?? null;
}

export function sendSms(phone: string, message: string): { sent: boolean; pilot: boolean } {
  const pilot = process.env.PILOT_OTP === 'true' || process.env.NODE_ENV !== 'production';
  console.log(`[SMS${pilot ? ' pilot' : ''}] ${phone}: ${message}`);
  return { sent: true, pilot };
}
