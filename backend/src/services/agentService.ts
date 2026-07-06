import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { encryptField } from './encryptionService';
import { logAudit } from './auditService';
import { createUser } from './userService';
import type { UserRole } from '../../../shared/src/roles';

export interface AgentRegistration {
  phoneNumber: string;
  name: string;
  governmentId: string;
  aggregationCenter: string;
  region: string;
  district: string;
}

export function registerAgent(data: AgentRegistration, registeredBy?: string): { agentId: string; userId: string } {
  const existing = db.prepare('SELECT agent_id FROM agents WHERE government_id_encrypted = ?')
    .get(encryptField(data.governmentId));
  if (existing) throw new Error('Agent with this government ID already registered');

  const userId = createUser({
    phoneNumber: data.phoneNumber,
    name: data.name,
    role: 'agent',
    district: data.district,
    region: data.region,
    aggregationCenter: data.aggregationCenter,
  });

  const agentId = uuidv4();
  db.prepare(`
    INSERT INTO agents (agent_id, user_id, government_id_encrypted, aggregation_center, region, district, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_verification')
  `).run(
    agentId, userId, encryptField(data.governmentId),
    data.aggregationCenter, data.region, data.district
  );

  logAudit({
    userId: registeredBy,
    action: 'agent.register',
    category: 'agent',
    resourceType: 'agent',
    resourceId: agentId,
    details: { region: data.region, aggregationCenter: data.aggregationCenter },
    success: true,
  });

  return { agentId, userId };
}

export function verifyAgent(agentId: string, verifiedBy: string): void {
  db.prepare(`
    UPDATE agents SET status = 'active', verified_by = ?, verified_at = datetime('now')
    WHERE agent_id = ?
  `).run(verifiedBy, agentId);

  logAudit({
    userId: verifiedBy,
    action: 'agent.action',
    category: 'agent',
    resourceType: 'agent',
    resourceId: agentId,
    details: { action: 'verified' },
    success: true,
  });
}

export function getAgentsInRegion(region: string) {
  return db.prepare(`
    SELECT a.agent_id, a.aggregation_center, a.region, a.district, a.status,
           u.name, u.phone_number, u.created_at
    FROM agents a
    JOIN users u ON a.user_id = u.user_id
    WHERE a.region = ?
    ORDER BY a.created_at DESC
  `).all(region);
}

export function getFarmersInRegion(region: string, district?: string) {
  if (district) {
    return db.prepare(`
      SELECT f.farmer_id, f.key, f.name, f.phone_number, f.district, f.sub_county, f.status,
             mg.name as membership_group_name
      FROM farmers f
      JOIN membership_groups mg ON f.membership_group_id = mg.id
      WHERE f.district = ?
      ORDER BY f.created_at DESC
    `).all(district);
  }
  return db.prepare(`
    SELECT f.farmer_id, f.key, f.name, f.phone_number, f.district, f.sub_county, f.status,
           mg.name as membership_group_name
    FROM farmers f
    JOIN membership_groups mg ON f.membership_group_id = mg.id
    WHERE f.district IN (SELECT DISTINCT district FROM agents WHERE region = ?)
    ORDER BY f.created_at DESC
  `).all(region);
}

export function createPaymentVerification(paymentId: string, agentUserId: string, notes?: string): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO payment_verifications (id, payment_id, agent_user_id, notes)
    VALUES (?, ?, ?, ?)
  `).run(id, paymentId, agentUserId, notes ?? null);

  logAudit({
    userId: agentUserId,
    action: 'payment.verify',
    category: 'financial',
    resourceType: 'payment',
    resourceId: paymentId,
    details: { verificationId: id },
    success: true,
  });

  return id;
}

export function approvePaymentVerification(verificationId: string, approvedBy: string): void {
  const verification = db.prepare(`SELECT * FROM payment_verifications WHERE id = ?`).get(verificationId) as {
    id: string; payment_id: string;
  } | undefined;
  if (!verification) throw new Error('Verification not found');

  db.prepare(`
    UPDATE payment_verifications SET status = 'approved', verified_at = datetime('now')
    WHERE id = ?
  `).run(verificationId);

  db.prepare(`UPDATE payments SET verification_status = 'verified' WHERE id = ?`).run(verification.payment_id);

  logAudit({
    userId: approvedBy,
    action: 'payment.verify',
    category: 'financial',
    resourceType: 'payment',
    resourceId: verification.payment_id,
    details: { verificationId, status: 'approved' },
    success: true,
  });
}

export function getAgentByUserId(userId: string) {
  return db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(userId);
}
