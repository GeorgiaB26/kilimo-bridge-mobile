import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { encryptField } from './encryptionService';
import { logAudit } from './auditService';
import { createUser } from './userService';

export interface AgentRegistration {
  phoneNumber: string;
  name: string;
  governmentId: string;
  aggregationCenter: string;
  region: string;
  district: string;
}

export async function registerAgent(
  data: AgentRegistration,
  registeredBy?: string
): Promise<{ agentId: string; userId: string }> {
  const encryptedGovId = encryptField(data.governmentId);
  const existing = await queryOne<{ agent_id: string }>(
    'SELECT agent_id FROM agents WHERE government_id_encrypted = $1',
    [encryptedGovId]
  );
  if (existing) throw new Error('Agent with this government ID already registered');

  const userId = await createUser({
    phoneNumber: data.phoneNumber,
    name: data.name,
    role: 'agent',
    district: data.district,
    region: data.region,
    aggregationCenter: data.aggregationCenter,
  });

  const agentId = uuidv4();
  await query(
    `INSERT INTO agents (
      agent_id, user_id, government_id_encrypted, aggregation_center, region, district, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_verification')`,
    [
      agentId,
      userId,
      encryptedGovId,
      data.aggregationCenter,
      data.region,
      data.district,
    ]
  );

  await logAudit({
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

export async function verifyAgent(agentId: string, verifiedBy: string): Promise<void> {
  await query(
    `UPDATE agents SET status = 'active', verified_by = $1, verified_at = NOW()
     WHERE agent_id = $2`,
    [verifiedBy, agentId]
  );

  await logAudit({
    userId: verifiedBy,
    action: 'agent.action',
    category: 'agent',
    resourceType: 'agent',
    resourceId: agentId,
    details: { action: 'verified' },
    success: true,
  });
}

export async function getAgentsInRegion(region: string) {
  return query(
    `SELECT a.agent_id, a.aggregation_center, a.region, a.district, a.status,
            u.name, u.phone_number, u.created_at
     FROM agents a
     JOIN users u ON a.user_id = u.user_id
     WHERE a.region = $1
     ORDER BY a.created_at DESC`,
    [region]
  );
}

export async function getFarmersInRegion(region: string, district?: string) {
  if (district) {
    return query(
      `SELECT f.farmer_id, f.key, f.name, f.phone_number, f.district, f.sub_county, f.status,
              mg.name as membership_group_name
       FROM farmers f
       JOIN membership_groups mg ON f.membership_group_id = mg.id
       WHERE f.district = $1
       ORDER BY f.created_at DESC`,
      [district]
    );
  }
  return query(
    `SELECT f.farmer_id, f.key, f.name, f.phone_number, f.district, f.sub_county, f.status,
            mg.name as membership_group_name
     FROM farmers f
     JOIN membership_groups mg ON f.membership_group_id = mg.id
     WHERE f.district IN (SELECT DISTINCT district FROM agents WHERE region = $1)
     ORDER BY f.created_at DESC`,
    [region]
  );
}

export async function createPaymentVerification(
  paymentId: string,
  agentUserId: string,
  notes?: string
): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO payment_verifications (id, payment_id, agent_user_id, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, paymentId, agentUserId, notes ?? null]
  );

  await logAudit({
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

export async function approvePaymentVerification(verificationId: string, approvedBy: string): Promise<void> {
  const verification = await queryOne<{ id: string; payment_id: string }>(
    'SELECT * FROM payment_verifications WHERE id = $1',
    [verificationId]
  );
  if (!verification) throw new Error('Verification not found');

  await query(
    `UPDATE payment_verifications SET status = 'approved', verified_at = NOW()
     WHERE id = $1`,
    [verificationId]
  );

  await query(
    `UPDATE payments SET verification_status = 'verified' WHERE id = $1`,
    [verification.payment_id]
  );

  await logAudit({
    userId: approvedBy,
    action: 'payment.verify',
    category: 'financial',
    resourceType: 'payment',
    resourceId: verification.payment_id,
    details: { verificationId, status: 'approved' },
    success: true,
  });
}

export async function getAgentByUserId(userId: string) {
  return queryOne('SELECT * FROM agents WHERE user_id = $1', [userId]);
}

export async function getAgentById(agentId: string) {
  return queryOne('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
}

/** Same visibility rules as getFarmersInRegion — used before showing farmer detail to an agent. */
export async function isFarmerVisibleToAgent(
  farmerId: string,
  region: string,
  district?: string
): Promise<boolean> {
  if (district) {
    const row = await queryOne<{ farmer_id: string }>(
      'SELECT farmer_id FROM farmers WHERE farmer_id = $1 AND district = $2',
      [farmerId, district]
    );
    return !!row;
  }
  const row = await queryOne<{ farmer_id: string }>(
    `SELECT f.farmer_id FROM farmers f
     WHERE f.farmer_id = $1
       AND f.district IN (SELECT DISTINCT district FROM agents WHERE region = $2)`,
    [farmerId, region]
  );
  return !!row;
}
