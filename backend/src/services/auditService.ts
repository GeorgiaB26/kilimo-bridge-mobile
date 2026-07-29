import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/database';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'farmer.read'
  | 'farmer.create'
  | 'farmer.update'
  | 'farmer.update_location'
  | 'farmer.import'
  | 'agent.register'
  | 'agent.action'
  | 'payment.claim'
  | 'payment.process'
  | 'payment.verify'
  | 'payment.h2h_request'
  | 'payment.h2h_webhook'
  | 'banking.transaction'
  | 'data.access'
  | 'user.create'
  | 'permission.denied';

export type AuditCategory = 'auth' | 'financial' | 'agent' | 'farmer_data' | 'system';

interface AuditEntry {
  userId?: string;
  userRole?: string;
  action: AuditAction;
  category: AuditCategory;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  success?: boolean;
}

export async function logAudit(entry: AuditEntry): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO audit_logs (
      id, user_id, user_role, action, category, resource_type, resource_id,
      details, ip_address, success, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      id,
      entry.userId ?? null,
      entry.userRole ?? null,
      entry.action,
      entry.category,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress ?? null,
      entry.success !== false,
    ]
  );
  return id;
}

export async function getAuditLogs(filters: {
  userId?: string;
  category?: AuditCategory;
  action?: AuditAction;
  resourceId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters.category) {
    conditions.push(`category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters.action) {
    conditions.push(`action = $${idx++}`);
    params.push(filters.action);
  }
  if (filters.resourceId) {
    conditions.push(`resource_id = $${idx++}`);
    params.push(filters.resourceId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  return query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

export async function getAgentAuditLogs(agentUserId: string, limit = 50) {
  return query(
    `SELECT * FROM audit_logs
     WHERE user_id = $1 AND category IN ('agent', 'farmer_data', 'financial')
     ORDER BY created_at DESC LIMIT $2`,
    [agentUserId, limit]
  );
}

export async function getFinancialAuditLogs(limit = 100) {
  return query(
    `SELECT * FROM audit_logs
     WHERE category = 'financial'
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
}
