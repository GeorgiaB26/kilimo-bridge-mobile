import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { queryOne, query } from '../db/database';
import { createUser } from './userService';
import { registerAgent } from './agentService';
import { logAudit } from './auditService';

/** Types an unauthenticated caller may self-register as. Everything else is refused. */
export type SelfRegisterUserType = 'farmer' | 'field_agent' | 'project_manager';

/** Self-registered staff accounts cannot log in until someone sets users.status to 'active'. */
export const SELF_REGISTER_PENDING_STATUS = 'pending_approval';

/** Role names that must never be created by an unauthenticated caller (matched case-insensitively). */
const PRIVILEGED_USER_TYPES = new Set([
  'admin',
  'super_admin',
  'platform_admin',
  'banking_agent',
  'banking_admin',
  'agent',
  'field_officer',
]);

export function isPrivilegedSelfRegisterType(userType: unknown): boolean {
  return typeof userType === 'string' && PRIVILEGED_USER_TYPES.has(userType.trim().toLowerCase());
}

export interface SelfRegisterInput {
  /** Raw client value. Only SelfRegisterUserType values are accepted; privileged ones are refused. */
  userType: SelfRegisterUserType | (string & {});
  name: string;
  phone: string;
  email?: string;
  password?: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  governmentId?: string;
  sector?: string;
}

export async function selfRegisterUser(data: SelfRegisterInput): Promise<{
  success: boolean;
  message: string;
  userId?: string;
  pendingApproval?: boolean;
  /** True when the requested type is privileged: the route answers 403 and nothing was created. */
  forbidden?: boolean;
}> {
  // Checked before any database access: no account, no lookup, no audit entry saying "created".
  if (isPrivilegedSelfRegisterType(data.userType)) {
    return {
      success: false,
      forbidden: true,
      message: 'This account type cannot be created by self-registration',
    };
  }

  const name = data.name?.trim();
  const phone = data.phone?.trim();
  if (!name || !phone) {
    return { success: false, message: 'Name and phone are required' };
  }

  const existing = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [phone]
  );
  if (existing && data.userType !== 'farmer') {
    return { success: false, message: 'This phone number is already registered' };
  }

  if (data.userType === 'farmer') {
    return {
      success: true,
      message: 'Continue with the farmer registration form to complete your profile.',
    };
  }

  if (data.userType === 'field_agent') {
    if (!data.governmentId?.trim()) {
      return { success: false, message: 'Government ID is required for field agents' };
    }
    if (!data.aggregationCenter?.trim() || !data.region?.trim() || !data.district?.trim()) {
      return { success: false, message: 'Aggregation centre, region, and district are required' };
    }
    try {
      const result = await registerAgent({
        phoneNumber: phone,
        name,
        governmentId: data.governmentId.trim(),
        aggregationCenter: data.aggregationCenter.trim(),
        region: data.region.trim(),
        district: data.district.trim(),
        userStatus: SELF_REGISTER_PENDING_STATUS,
      });
      await logAudit({
        userId: result.userId,
        action: 'agent.register',
        category: 'agent',
        resourceType: 'user',
        resourceId: result.userId,
        details: {
          user_type: 'field_agent',
          email: data.email ?? null,
          self_registration: true,
          status: SELF_REGISTER_PENDING_STATUS,
        },
        success: true,
      });
      return {
        success: true,
        message: 'Field agent account created. It needs approval before you can log in.',
        userId: result.userId,
        pendingApproval: true,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }

  if (data.userType === 'project_manager') {
    if (!data.password || data.password.length < 6) {
      return { success: false, message: 'Password is required (minimum 6 characters)' };
    }
    const passwordHash = bcrypt.hashSync(data.password, 12);
    const userId = uuidv4();
    try {
      await query(
        `INSERT INTO users (
          user_id, phone_number, name, role, district, region, status, password_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          phone,
          name,
          'admin',
          data.district?.trim() ?? data.region?.trim() ?? null,
          data.region?.trim() ?? null,
          SELF_REGISTER_PENDING_STATUS,
          passwordHash,
        ]
      );
      await logAudit({
        userId,
        action: 'user.create',
        category: 'system',
        resourceType: 'user',
        resourceId: userId,
        details: {
          user_type: data.userType,
          email: data.email ?? null,
          self_registration: true,
          status: SELF_REGISTER_PENDING_STATUS,
        },
        success: true,
      });
      return {
        success: true,
        userId,
        pendingApproval: true,
        message:
          'Your account will be reviewed by the tech team. You will receive approval notification via email.',
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }

  return { success: false, message: 'Invalid account type' };
}
