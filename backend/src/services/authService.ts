import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { normalizePhone } from '../../../shared/src/validation';
import { normalizeRole, type UserRole } from '../../../shared/src/roles';
import { verifyPassword } from './encryptionService';
import { logAudit } from './auditService';

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
  region?: string;
  aggregationCenter?: string;
}

function rowToUser(row: {
  user_id: string;
  phone_number: string;
  name: string;
  role: string;
  farmer_id: string | null;
  district: string | null;
  region: string | null;
  aggregation_center: string | null;
}): AuthUser {
  return {
    userId: row.user_id,
    phoneNumber: row.phone_number,
    name: row.name,
    role: normalizeRole(row.role),
    farmerId: row.farmer_id ?? undefined,
    district: row.district ?? undefined,
    region: row.region ?? undefined,
    aggregationCenter: row.aggregation_center ?? undefined,
  };
}

export function requestOtp(phone: string): { success: boolean; message: string; devCode?: string } {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, message: 'Invalid phone number format' };
  }

  const user = db.prepare('SELECT user_id FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active');
  if (!user) {
    return { success: false, message: 'Phone number not registered. Contact your cooperative admin.' };
  }

  const pilotOtp = process.env.PILOT_OTP === 'true';
  const code =
    process.env.NODE_ENV !== 'production' || pilotOtp
      ? DEV_OTP
      : String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  db.prepare('DELETE FROM otp_codes WHERE phone_number = ?').run(normalized);
  db.prepare('INSERT INTO otp_codes (id, phone_number, code, expires_at) VALUES (?, ?, ?, ?)').run(
    uuidv4(), normalized, code, expiresAt
  );

  return {
    success: true,
    message: `OTP sent to ${normalized}`,
    devCode: process.env.NODE_ENV !== 'production' || pilotOtp ? DEV_OTP : undefined,
  };
}

export function verifyOtp(phone: string, code: string, ipAddress?: string): {
  success: boolean; token?: string; user?: AuthUser; error?: string;
} {
  const normalized = normalizePhone(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const otp = db.prepare(`
    SELECT * FROM otp_codes WHERE phone_number = ? AND used = 0 ORDER BY created_at DESC LIMIT 1
  `).get(normalized) as { code: string; expires_at: string; id: string } | undefined;

  if (!otp) return { success: false, error: 'No OTP requested. Please request a new code.' };
  if (new Date(otp.expires_at) < new Date()) return { success: false, error: 'OTP expired. Please request a new code.' };
  if (otp.code !== code.trim()) {
    logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid OTP code.' };
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);

  const row = db.prepare('SELECT * FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active') as Parameters<typeof rowToUser>[0] | undefined;
  if (!row) return { success: false, error: 'User not found' };

  const user = rowToUser(row);
  const token = jwt.sign(
    { userId: user.userId, role: user.role, farmerId: user.farmerId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logAudit({ userId: user.userId, userRole: user.role, action: 'auth.login', category: 'auth', ipAddress, success: true });
  return { success: true, token, user };
}

export async function loginWithPassword(phone: string, password: string, ipAddress?: string): Promise<{
  success: boolean; token?: string; user?: AuthUser; error?: string;
}> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const row = db.prepare('SELECT * FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active') as
    (Parameters<typeof rowToUser>[0] & { password_hash: string | null }) | undefined;

  if (!row || !row.password_hash) {
    logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid credentials' };
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid credentials' };
  }

  const user = rowToUser(row);
  const token = jwt.sign({ userId: user.userId, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  logAudit({ userId: user.userId, userRole: user.role, action: 'auth.login', category: 'auth', details: { method: 'password' }, ipAddress, success: true });
  return { success: true, token, user };
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const row = db.prepare('SELECT * FROM users WHERE user_id = ? AND status = ?').get(payload.userId, 'active') as Parameters<typeof rowToUser>[0] | undefined;
    if (!row) return null;
    return rowToUser(row);
  } catch {
    return null;
  }
}

/** Dev only — one-step login for demo accounts (no OTP round-trip). */
export function devQuickLogin(phone: string, ipAddress?: string): {
  success: boolean; token?: string; user?: AuthUser; error?: string;
} {
  if (process.env.NODE_ENV === 'production') {
    return { success: false, error: 'Not available' };
  }

  const normalized = normalizePhone(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const row = db.prepare('SELECT * FROM users WHERE phone_number = ? AND status = ?').get(normalized, 'active') as
    Parameters<typeof rowToUser>[0] | undefined;

  if (!row) {
    return {
      success: false,
      error: 'Phone not registered. In Terminal run: cd ~/kilimo-bridge-mobile && npm run reset — then restart backend.',
    };
  }

  const user = rowToUser(row);
  const token = jwt.sign(
    { userId: user.userId, role: user.role, farmerId: user.farmerId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logAudit({
    userId: user.userId,
    userRole: user.role,
    action: 'auth.login',
    category: 'auth',
    details: { method: 'dev_quick' },
    ipAddress,
    success: true,
  });

  return { success: true, token, user };
}
