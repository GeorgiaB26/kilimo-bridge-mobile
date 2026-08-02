import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { logAudit } from './auditService';
import { createNotification, sendSms } from './notificationService';

export interface FarmerSupportContacts {
  fieldAgent: {
    agentId: string;
    userId: string;
    name: string;
    phone: string;
    aggregationCenter?: string | null;
    district?: string | null;
  } | null;
  aggregationCentre: {
    centreId: string;
    name: string;
    location: string;
    managerName?: string | null;
    managerPhone?: string | null;
    country?: string | null;
  } | null;
  bankingAgent: {
    name: string;
    phone: string;
  } | null;
}

export async function ensureFarmerHelpRequestsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS farmer_help_requests (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_agent_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by_user_id TEXT
    )
  `);
}

export async function getFarmerSupportContacts(farmerId: string): Promise<FarmerSupportContacts> {
  const farmer = await queryOne<{
    aggregation_center: string | null;
    district: string;
    registered_by_agent_id: string | null;
  }>(
    `SELECT aggregation_center, district, registered_by_agent_id FROM farmers WHERE farmer_id = $1`,
    [farmerId]
  );

  if (!farmer) {
    return { fieldAgent: null, aggregationCentre: null, bankingAgent: null };
  }

  let fieldAgent = await resolveRegisteredFieldAgent(farmer.registered_by_agent_id);
  if (!fieldAgent) {
    fieldAgent = await resolveFieldAgentByDistrict(
      farmer.district,
      farmer.aggregation_center
    );
  }

  const aggregationCentre = await resolveAggregationCentre(farmer.aggregation_center);

  const bankingRow = await queryOne<{ name: string; phone_number: string }>(
    `SELECT name, phone_number FROM users
     WHERE role::text = 'banking_agent'
     ORDER BY created_at ASC
     LIMIT 1`
  );

  return {
    fieldAgent,
    aggregationCentre,
    bankingAgent: bankingRow
      ? { name: bankingRow.name, phone: bankingRow.phone_number }
      : null,
  };
}

async function resolveRegisteredFieldAgent(agentId: string | null) {
  if (!agentId) return null;
  return queryOne<{
    agent_id: string;
    user_id: string;
    name: string;
    phone_number: string;
    aggregation_center: string | null;
    district: string | null;
  }>(
    `SELECT a.agent_id, u.user_id, u.name, u.phone_number, a.aggregation_center, a.district
     FROM agents a
     JOIN users u ON u.user_id = a.user_id
     WHERE a.agent_id = $1`,
    [agentId]
  ).then((row) =>
    row
      ? {
          agentId: row.agent_id,
          userId: row.user_id,
          name: row.name,
          phone: row.phone_number,
          aggregationCenter: row.aggregation_center,
          district: row.district,
        }
      : null
  );
}

async function resolveFieldAgentByDistrict(district: string, aggregationCenter?: string | null) {
  const row = await queryOne<{
    agent_id: string;
    user_id: string;
    name: string;
    phone_number: string;
    aggregation_center: string | null;
    district: string | null;
  }>(
    `
    SELECT a.agent_id, u.user_id, u.name, u.phone_number, a.aggregation_center, a.district
    FROM agents a
    JOIN users u ON u.user_id = a.user_id
    WHERE a.status = 'active' AND a.district = $1
      AND (
        $2::text IS NULL
        OR lower(a.aggregation_center) = lower($2::text)
        OR a.aggregation_center IS NULL
      )
    ORDER BY
      CASE WHEN $2::text IS NOT NULL AND lower(a.aggregation_center) = lower($2::text) THEN 0 ELSE 1 END
    LIMIT 1
    `,
    [district, aggregationCenter ?? null]
  );

  return row
    ? {
        agentId: row.agent_id,
        userId: row.user_id,
        name: row.name,
        phone: row.phone_number,
        aggregationCenter: row.aggregation_center,
        district: row.district,
      }
    : null;
}

async function resolveAggregationCentre(name: string | null) {
  if (!name?.trim()) return null;

  const row = await queryOne<{
    centre_id: string;
    name: string;
    location_level_1: string;
    location_level_2: string | null;
    region: string | null;
    country: string | null;
    manager_name: string | null;
    manager_phone: string | null;
  }>(
    `SELECT centre_id, name, location_level_1, location_level_2, region, country, manager_name, manager_phone
     FROM aggregation_centres
     WHERE lower(name) = lower($1)
     LIMIT 1`,
    [name.trim()]
  );

  if (!row) {
    return {
      centreId: '',
      name: name.trim(),
      location: '',
      managerName: null,
      managerPhone: null,
      country: null,
    };
  }

  const locationParts = [row.location_level_1, row.location_level_2, row.region].filter(Boolean);
  return {
    centreId: row.centre_id,
    name: row.name,
    location: locationParts.join(', '),
    managerName: row.manager_name,
    managerPhone: row.manager_phone,
    country: row.country,
  };
}

export async function createFarmerHelpRequest(farmerId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Please write a short message for your field agent.');
  if (trimmed.length > 500) throw new Error('Message must be 500 characters or less.');

  const farmer = await queryOne<{ name: string; phone_number: string }>(
    `SELECT name, phone_number FROM farmers WHERE farmer_id = $1`,
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');

  const contacts = await getFarmerSupportContacts(farmerId);
  const agentUserId = contacts.fieldAgent?.userId;
  if (!agentUserId) {
    throw new Error('No field agent is assigned yet. Call your aggregation centre directly.');
  }

  const id = uuidv4();
  await query(
    `INSERT INTO farmer_help_requests (
      id, farmer_id, message, status, assigned_agent_user_id
    ) VALUES ($1, $2, $3, 'open', $4)`,
    [id, farmerId, trimmed, agentUserId]
  );

  const farmerUser = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM users WHERE farmer_id = $1 LIMIT 1`,
    [farmerId]
  );

  await createNotification({
    userId: agentUserId,
    title: 'Farmer needs help',
    message: `${farmer.name} (${farmer.phone_number}): ${trimmed}`,
    type: 'farmer_help_request',
  });

  if (farmerUser?.user_id) {
    await createNotification({
      userId: farmerUser.user_id,
      title: 'Message sent',
      message: 'Your field agent has been notified and will contact you soon.',
      type: 'help_request_sent',
    });
  }

  if (contacts.fieldAgent?.phone) {
    sendSms(
      contacts.fieldAgent.phone,
      `Kilimo Bridge: ${farmer.name} needs help — "${trimmed.slice(0, 80)}". Open Tasks in the agent app.`
    );
  }

  await logAudit({
    userId: farmerUser?.user_id,
    action: 'agent.action',
    category: 'agent',
    resourceType: 'farmer_help_request',
    resourceId: id,
    details: {
      farmer_id: farmerId,
      farmer_name: farmer.name,
      assigned_agent_user_id: agentUserId,
      message: trimmed,
      task_type: 'farmer_help_request',
    },
    success: true,
  });

  return { id, assignedAgentUserId: agentUserId };
}

export async function listOpenHelpRequestsForAgent(agentUserId: string) {
  return query<{
    id: string;
    farmer_id: string;
    message: string;
    status: string;
    created_at: string;
    farmer_name: string;
    farmer_phone: string;
  }>(
    `
    SELECT h.id, h.farmer_id, h.message, h.status, h.created_at,
           f.name AS farmer_name, f.phone_number AS farmer_phone
    FROM farmer_help_requests h
    JOIN farmers f ON f.farmer_id = h.farmer_id
    WHERE h.assigned_agent_user_id = $1 AND h.status = 'open'
    ORDER BY h.created_at DESC
    `,
    [agentUserId]
  );
}

export async function resolveFarmerHelpRequest(requestId: string, agentUserId: string) {
  const row = await queryOne<{ id: string; farmer_id: string }>(
    `SELECT id, farmer_id FROM farmer_help_requests
     WHERE id = $1 AND assigned_agent_user_id = $2 AND status = 'open'`,
    [requestId, agentUserId]
  );
  if (!row) throw new Error('Help request not found or already closed');

  await query(
    `UPDATE farmer_help_requests
     SET status = 'resolved', resolved_at = NOW(), resolved_by_user_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [agentUserId, requestId]
  );

  const farmerUser = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM users WHERE farmer_id = $1 LIMIT 1`,
    [row.farmer_id]
  );
  if (farmerUser?.user_id) {
    await createNotification({
      userId: farmerUser.user_id,
      title: 'Field agent contacted you',
      message: 'Your field agent has marked your help request as handled.',
      type: 'help_request_resolved',
    });
  }

  await logAudit({
    userId: agentUserId,
    action: 'agent.action',
    category: 'agent',
    resourceType: 'farmer_help_request',
    resourceId: requestId,
    details: { action: 'resolved', farmer_id: row.farmer_id },
    success: true,
  });

  return { success: true };
}
