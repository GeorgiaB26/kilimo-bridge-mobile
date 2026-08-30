import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { normalizePhoneAnyCountry } from '../../../shared/src/farmerId';
import { normalizeRole, type UserRole } from '../../../shared/src/roles';
import { verifyPassword } from './encryptionService';
import { logAudit } from './auditService';

const JWT_SECRET = process.env.JWT_SECRET || 'kilimo-bridge-dev-secret-change-in-production';
const OTP_EXPIRY_MINUTES = 10;
const DEV_OTP = '123456';

type UserRow = {
  user_id: string;
  phone_number: string;
  name: string;
  role: string;
  farmer_id: string | null;
  district: string | null;
  region: string | null;
  aggregation_center: string | null;
  password_hash?: string | null;
};

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

function rowToUser(row: UserRow): AuthUser {
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

export async function requestOtp(phone: string): Promise<{ success: boolean; message: string; devCode?: string }> {
  const normalized = normalizePhoneAnyCountry(phone);
  if (!normalized) {
    return { success: false, message: 'Invalid phone number format' };
  }

  const user = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1 AND status = $2',
    [normalized, 'active']
  );
  if (!user) {
    return { success: false, message: 'Phone number not registered. Contact your cooperative admin.' };
  }

  const pilotOtp = process.env.PILOT_OTP === 'true';
  const code =
    process.env.NODE_ENV !== 'production' || pilotOtp
      ? DEV_OTP
      : String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await query('DELETE FROM otp_codes WHERE phone_number = $1', [normalized]);
  await query(
    'INSERT INTO otp_codes (id, phone_number, code, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), normalized, code, expiresAt]
  );

  return {
    success: true,
    message: `OTP sent to ${normalized}`,
    devCode: process.env.NODE_ENV !== 'production' || pilotOtp ? DEV_OTP : undefined,
  };
}

export async function verifyOtp(
  phone: string,
  code: string,
  ipAddress?: string
): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  const normalized = normalizePhoneAnyCountry(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const otp = await queryOne<{ code: string; expires_at: string; id: string }>(
    `SELECT code, expires_at, id FROM otp_codes
     WHERE phone_number = $1 AND used = false
     ORDER BY created_at DESC LIMIT 1`,
    [normalized]
  );

  if (!otp) return { success: false, error: 'No OTP requested. Please request a new code.' };
  if (new Date(otp.expires_at) < new Date()) return { success: false, error: 'OTP expired. Please request a new code.' };
  if (otp.code !== code.trim()) {
    await logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid OTP code.' };
  }

  await query('UPDATE otp_codes SET used = true WHERE id = $1', [otp.id]);

  const row = await queryOne<UserRow>(
    'SELECT * FROM users WHERE phone_number = $1 AND status = $2',
    [normalized, 'active']
  );
  if (!row) return { success: false, error: 'User not found' };

  const user = rowToUser(row);
  const token = jwt.sign(
    { userId: user.userId, role: user.role, farmerId: user.farmerId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  await logAudit({
    userId: user.userId,
    userRole: user.role,
    action: 'auth.login',
    category: 'auth',
    ipAddress,
    success: true,
  });
  return { success: true, token, user };
}

export async function loginWithPassword(
  phone: string,
  password: string,
  ipAddress?: string
): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  const normalized = normalizePhoneAnyCountry(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const row = await queryOne<UserRow>(
    'SELECT * FROM users WHERE phone_number = $1 AND status = $2',
    [normalized, 'active']
  );

  if (!row?.password_hash) {
    await logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid credentials' };
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    await logAudit({ action: 'auth.login_failed', category: 'auth', details: { phone: normalized }, ipAddress, success: false });
    return { success: false, error: 'Invalid credentials' };
  }

  const user = rowToUser(row);
  const token = jwt.sign({ userId: user.userId, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  await logAudit({
    userId: user.userId,
    userRole: user.role,
    action: 'auth.login',
    category: 'auth',
    details: { method: 'password' },
    ipAddress,
    success: true,
  });
  return { success: true, token, user };
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE user_id = $1 AND status = $2',
      [payload.userId, 'active']
    );
    if (!row) return null;
    return rowToUser(row);
  } catch {
    return null;
  }
}

/** Dev / pilot preview — one-step login for demo accounts (no OTP round-trip). */
export async function devQuickLogin(
  phone: string,
  ipAddress?: string
): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  const pilotDemo = process.env.PILOT_OTP === 'true';
  if (process.env.NODE_ENV === 'production' && !pilotDemo) {
    return { success: false, error: 'Not available' };
  }

  const normalized = normalizePhoneAnyCountry(phone);
  if (!normalized) return { success: false, error: 'Invalid phone number' };

  const row = await queryOne<UserRow>(
    'SELECT * FROM users WHERE phone_number = $1 AND status = $2',
    [normalized, 'active']
  );

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

  await logAudit({
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
