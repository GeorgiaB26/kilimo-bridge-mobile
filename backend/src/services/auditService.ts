import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'farmer.read'
  | 'farmer.create'
  | 'farmer.update'
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

export function logAudit(entry: AuditEntry): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, user_role, action, category, resource_type, resource_id,
      details, ip_address, success, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    entry.userId ?? null,
    entry.userRole ?? null,
    entry.action,
    entry.category,
    entry.resourceType ?? null,
    entry.resourceId ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ipAddress ?? null,
    entry.success !== false ? 1 : 0
  );
  return id;
}

export function getAuditLogs(filters: {
  userId?: string;
  category?: AuditCategory;
  action?: AuditAction;
  resourceId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.userId) { conditions.push('user_id = ?'); params.push(filters.userId); }
  if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
  if (filters.action) { conditions.push('action = ?'); params.push(filters.action); }
  if (filters.resourceId) { conditions.push('resource_id = ?'); params.push(filters.resourceId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  return db.prepare(`
    SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
}

export function getAgentAuditLogs(agentUserId: string, limit = 50) {
  return db.prepare(`
    SELECT * FROM audit_logs
    WHERE user_id = ? AND category IN ('agent', 'farmer_data', 'financial')
    ORDER BY created_at DESC LIMIT ?
  `).all(agentUserId, limit);
}

export function getFinancialAuditLogs(limit = 100) {
  return db.prepare(`
    SELECT * FROM audit_logs
    WHERE category = 'financial'
    ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}
