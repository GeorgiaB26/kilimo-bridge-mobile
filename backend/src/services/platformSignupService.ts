import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { normalizePhone } from '../../../shared/src/validation';
import { normalizeRole, type UserRole } from '../../../shared/src/roles';
import { encryptField, hashPassword } from './encryptionService';
import { logAudit } from './auditService';
import { createUser } from './userService';

/** Roles allowed on public sign-up (admin stays Loveable / staff provisioning). */
export const SELF_SIGNUP_ROLES: UserRole[] = ['farmer', 'agent', 'banking'];

export interface PlatformSignupInput {
  phone: string;
  name: string;
  role: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  password?: string;
}

export async function registerPlatformUser(
  data: PlatformSignupInput,
  ipAddress?: string
): Promise<{ success: boolean; error?: string; phone?: string }> {
  const allowSignup =
    process.env.NODE_ENV !== 'production' ||
    process.env.PILOT_OTP === 'true' ||
    process.env.ALLOW_PLATFORM_SIGNUP === 'true';

  if (!allowSignup) {
    return { success: false, error: 'Self-registration is disabled. Contact your administrator.' };
  }

  const normalized = normalizePhone(data.phone);
  if (!normalized) return { success: false, error: 'Invalid phone number format' };

  const name = data.name?.trim();
  if (!name || name.length < 2) return { success: false, error: 'Enter your full name' };

  const role = normalizeRole(data.role);
  if (!SELF_SIGNUP_ROLES.includes(role)) {
    return { success: false, error: 'Choose Farmer, Field Agent, or Banking Officer' };
  }

  const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(normalized);
  if (existing) return { success: false, error: 'This phone is already registered. Sign in instead.' };

  let passwordHash: string | undefined;
  if (role === 'banking') {
    const pwd = data.password ?? '';
    if (pwd.length < 8) {
      return { success: false, error: 'Banking accounts need a password (min 8 characters)' };
    }
    passwordHash = await hashPassword(pwd);
  }

  if (role === 'agent') {
    const district = data.district?.trim();
    const region = data.region?.trim() || district;
    const centre = data.aggregationCenter?.trim();
    if (!district) return { success: false, error: 'District is required for field agents' };
    if (!centre) return { success: false, error: 'Aggregation centre is required for field agents' };

    const userId = createUser({
      phoneNumber: normalized,
      name,
      role: 'agent',
      district,
      region,
      aggregationCenter: centre,
    });

    const agentId = uuidv4();
    db.prepare(`
      INSERT INTO agents (agent_id, user_id, government_id_encrypted, aggregation_center, region, district, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending_verification')
    `).run(agentId, userId, encryptField(`self-signup-${userId}`), centre, region, district);
  } else {
    createUser({
      phoneNumber: normalized,
      name,
      role,
      district: data.district?.trim() || undefined,
      passwordHash,
    });
  }

  logAudit({
    action: 'auth.register',
    category: 'auth',
    details: { phone: normalized, role },
    ipAddress,
    success: true,
  });

  return { success: true, phone: normalized };
}
