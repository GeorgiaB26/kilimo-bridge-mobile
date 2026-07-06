import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { normalizePhone } from '../../../shared/src/validation';
import type { UserRole } from '../../../shared/src/roles';

const JWT_SECRET = process.env.JWT_SECRET || 'kilimo-bridge-dev-secret-change-in-production';
const OTP_EXPIRY_MINUTES = 10;
const DEV_OTP = '123456';

export interface AuthUser {
  userId: string;
  phoneNumber: string;
  name: string;
  role: UserRole;
  farmerId?: string;
  district?: string;
}

export function requestOtp(phone: string): { success: boolean; message: string; devCode?: string } {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, message: 'Invalid phone number format' };
  }

  const user = db.prepare('SELECT * FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active') as {
    user_id: string;
  } | undefined;

  if (!user) {
    return { success: false, message: 'Phone number not registered. Contact your cooperative admin.' };
  }

  const code = process.env.NODE_ENV === 'production' ? String(Math.floor(100000 + Math.random() * 900000)) : DEV_OTP;
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  db.prepare('DELETE FROM otp_codes WHERE phone_number = ?').run(normalized);
  db.prepare('INSERT INTO otp_codes (id, phone_number, code, expires_at) VALUES (?, ?, ?, ?)').run(
    uuidv4(), normalized, code, expiresAt
  );

  // In production, send SMS here
  return {
    success: true,
    message: `OTP sent to ${normalized}`,
    devCode: process.env.NODE_ENV !== 'production' ? DEV_OTP : undefined,
  };
}

export function verifyOtp(phone: string, code: string): { success: boolean; token?: string; user?: AuthUser; error?: string } {
  const normalized = normalizePhone(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const otp = db.prepare(`
    SELECT * FROM otp_codes WHERE phone_number = ? AND used = 0 ORDER BY created_at DESC LIMIT 1
  `).get(normalized) as { code: string; expires_at: string; id: string } | undefined;

  if (!otp) return { success: false, error: 'No OTP requested. Please request a new code.' };
  if (new Date(otp.expires_at) < new Date()) return { success: false, error: 'OTP expired. Please request a new code.' };
  if (otp.code !== code.trim()) return { success: false, error: 'Invalid OTP code.' };

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);

  const row = db.prepare('SELECT * FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active') as {
    user_id: string;
    phone_number: string;
    name: string;
    role: UserRole;
    farmer_id: string | null;
    district: string | null;
  } | undefined;

  if (!row) return { success: false, error: 'User not found' };

  const user: AuthUser = {
    userId: row.user_id,
    phoneNumber: row.phone_number,
    name: row.name,
    role: row.role,
    farmerId: row.farmer_id ?? undefined,
    district: row.district ?? undefined,
  };

  const token = jwt.sign(
    { userId: user.userId, role: user.role, farmerId: user.farmerId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { success: true, token, user };
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const row = db.prepare('SELECT * FROM users WHERE user_id = ? AND status = ?').get(payload.userId, 'active') as {
      user_id: string;
      phone_number: string;
      name: string;
      role: UserRole;
      farmer_id: string | null;
      district: string | null;
    } | undefined;
    if (!row) return null;
    return {
      userId: row.user_id,
      phoneNumber: row.phone_number,
      name: row.name,
      role: row.role,
      farmerId: row.farmer_id ?? undefined,
      district: row.district ?? undefined,
    };
  } catch {
    return null;
  }
}
