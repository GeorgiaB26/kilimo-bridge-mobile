import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { queryOne, query } from '../db/database';
import { createUser } from './userService';
import { registerAgent } from './agentService';
import { logAudit } from './auditService';

export type SelfRegisterUserType = 'farmer' | 'field_agent' | 'admin' | 'project_manager';

export interface SelfRegisterInput {
  userType: SelfRegisterUserType;
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
}> {
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
        },
        success: true,
      });
      return {
        success: true,
        message: 'Field agent account created. Awaiting verification before you can log in.',
        userId: result.userId,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }

  if (data.userType === 'admin' || data.userType === 'project_manager') {
    if (!data.password || data.password.length < 6) {
      return { success: false, message: 'Password is required (minimum 6 characters)' };
    }
    const pending = data.userType === 'project_manager';
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
          pending ? 'pending_approval' : 'active',
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
          status: pending ? 'pending_approval' : 'active',
        },
        success: true,
      });
      return {
        success: true,
        userId,
        pendingApproval: pending,
        message: pending
          ? 'Your account will be reviewed by the tech team. You will receive approval notification via email.'
          : 'Admin account created. You can sign in with your phone and password.',
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
