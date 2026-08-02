import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query, queryOne } from './db/database';
import { createUser } from './services/userService';
import { ensureMembershipGroup } from './services/farmerService';
import { encryptField, hashIdNumber } from './services/encryptionService';
import { backfillFarmerSupportLinks } from './services/farmerHelpRequestService';

const DEMO_FARMER_PHONE = '+254712345678';
const DEMO_AGENT_PHONE = '+254700000003';
const DEMO_BANKING_PHONE = '+254700000004';
const DEMO_AGGREGATION_CENTRE = 'Kiambu Town Hall';

const DEMO_MEMBERSHIP_GROUPS = [
  'Gulu Women Economic Dev',
  'Kiambu Cooperative',
  'Nairobi Women Coop',
  'Test Coop',
];

const DEMO_FARMER = {
  key: 'DEMO-001',
  name: 'John Doe',
  gender: 'M',
  idNumber: '99999999',
  membershipGroup: 'Test Coop',
  district: 'Kiambu',
  subCounty: 'Limuru',
};

/** Always ensure demo login accounts + portal data work, even with 2617+ imported farmers. */
export async function ensureDemoFarmerPortal(): Promise<void> {
  for (const name of DEMO_MEMBERSHIP_GROUPS) {
    await ensureMembershipGroup(name);
  }
  const farmerId = await ensureDemoFarmerRecord();
  if (!farmerId) {
    console.warn('Demo farmer record could not be created');
    return;
  }

  await ensureDemoFarmerUser(farmerId);
  await ensureDemoStaffUsers();
  await ensureDemoAgentRecord();
  await ensureDemoBankingUser();
  await linkDemoFarmerToAgent();
  await ensureDemoCentreManagers();
  await backfillFarmerSupportLinks();
  await ensureDemoFarmerPayments(farmerId);
  console.log(`Demo farmer portal ready: ${DEMO_FARMER.name} (${farmerId.slice(0, 8)}…)`);
}

async function ensureDemoFarmerRecord(): Promise<string | null> {
  const existing = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE phone_number = $1',
    [DEMO_FARMER_PHONE]
  );
  const groupId = await ensureMembershipGroup(DEMO_FARMER.membershipGroup);
  if (!groupId) return null;

  if (existing) {
    await query(
      `UPDATE farmers SET
        membership_group_id = $1,
        aggregation_center = $2,
        district = $3,
        sub_county = $4,
        country = 'Kenya',
        membership_type = COALESCE(membership_type, 'Active'),
        status = 'verified'
       WHERE farmer_id = $5`,
      [groupId, DEMO_AGGREGATION_CENTRE, DEMO_FARMER.district, DEMO_FARMER.subCounty, existing.farmer_id]
    );
    return existing.farmer_id;
  }
  const farmerId = uuidv4();
  await query(
    `INSERT INTO farmers (
      farmer_id, key, name, gender, id_number_encrypted, id_number_hash, membership_group_id,
      aggregation_center, phone_number, phone_country_prefix,
      country, district, sub_county, membership_type, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      farmerId,
      DEMO_FARMER.key,
      DEMO_FARMER.name,
      DEMO_FARMER.gender,
      encryptField(DEMO_FARMER.idNumber),
      hashIdNumber(DEMO_FARMER.idNumber),
      groupId,
      DEMO_AGGREGATION_CENTRE,
      DEMO_FARMER_PHONE,
      '+254',
      'Kenya',
      DEMO_FARMER.district,
      DEMO_FARMER.subCounty,
      'Active',
      'verified',
    ]
  );
  return farmerId;
}

async function ensureDemoFarmerUser(farmerId: string): Promise<void> {
  const existing = await queryOne<{ user_id: string; farmer_id: string | null }>(
    'SELECT user_id, farmer_id FROM users WHERE phone_number = $1',
    [DEMO_FARMER_PHONE]
  );

  if (!existing) {
    await createUser({
      phoneNumber: DEMO_FARMER_PHONE,
      name: DEMO_FARMER.name,
      role: 'farmer',
      farmerId,
      district: DEMO_FARMER.district,
    });
    return;
  }

  if (!existing.farmer_id) {
    await query('UPDATE users SET farmer_id = $1 WHERE user_id = $2', [farmerId, existing.user_id]);
  }
}

async function ensureDemoStaffUsers(): Promise<void> {
  const staff = [
    { phone: '+254700000001', name: 'Super Admin', role: 'super_admin' as const },
    { phone: '+254700000002', name: 'Platform Admin', role: 'platform_admin' as const },
    {
      phone: DEMO_AGENT_PHONE,
      name: 'Kiambu Agent',
      role: 'agent' as const,
      district: 'Kiambu',
      region: 'Central',
      aggregationCenter: DEMO_AGGREGATION_CENTRE,
    },
  ];
  for (const s of staff) {
    const row = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [s.phone]
    );
    if (!row) {
      await createUser({
        phoneNumber: s.phone,
        name: s.name,
        role: s.role,
        district: 'district' in s ? s.district : undefined,
        region: 'region' in s ? s.region : undefined,
        aggregationCenter: 'aggregationCenter' in s ? s.aggregationCenter : undefined,
      });
    } else if (s.role === 'agent') {
      await query(
        `UPDATE users SET
          name = $1,
          role = 'agent',
          district = $2,
          region = $3,
          aggregation_center = $4
         WHERE phone_number = $5`,
        [s.name, s.district, s.region, s.aggregationCenter, s.phone]
      );
    }
  }
}

/** Field agent row + scoping for Farmers / Centre tabs (always upserted for demo phone). */
async function ensureDemoAgentRecord(): Promise<void> {
  const user = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [DEMO_AGENT_PHONE]
  );
  if (!user) return;

  const agent = await queryOne<{ agent_id: string }>(
    'SELECT agent_id FROM agents WHERE user_id = $1',
    [user.user_id]
  );

  if (!agent) {
    const agentId = uuidv4();
    const encryptedGovId = encryptField('GOV-AGENT-DEMO-001');
    await query(
      `INSERT INTO agents (
        agent_id, user_id, government_id_encrypted, aggregation_center, region, district, status, verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())`,
      [agentId, user.user_id, encryptedGovId, DEMO_AGGREGATION_CENTRE, 'Central', 'Kiambu']
    );
  } else {
    await query(
      `UPDATE agents SET
        aggregation_center = $1,
        region = 'Central',
        district = 'Kiambu',
        status = 'active',
        verified_at = COALESCE(verified_at, NOW())
       WHERE agent_id = $2`,
      [DEMO_AGGREGATION_CENTRE, agent.agent_id]
    );
  }
}

/** Banking quick-login account (+254700000004 / Banking@2026). */
async function ensureDemoBankingUser(): Promise<void> {
  const existing = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [DEMO_BANKING_PHONE]
  );
  const passwordHash = bcrypt.hashSync('Banking@2026', 12);
  if (!existing) {
    await createUser({
      phoneNumber: DEMO_BANKING_PHONE,
      name: 'Equity Banking Officer',
      role: 'banking_agent',
      passwordHash,
    });
    return;
  }
  await query(
    `UPDATE users SET name = 'Equity Banking Officer', role = 'banking_agent', password_hash = $1 WHERE phone_number = $2`,
    [passwordHash, DEMO_BANKING_PHONE]
  );
}

async function linkDemoFarmerToAgent(): Promise<void> {
  const agent = await queryOne<{ agent_id: string }>(
  `SELECT a.agent_id FROM agents a
   JOIN users u ON u.user_id = a.user_id
   WHERE u.phone_number = $1`,
    [DEMO_AGENT_PHONE]
  );
  if (!agent) return;
  await query(
    `UPDATE farmers SET registered_by_agent_id = $1 WHERE phone_number = $2`,
    [agent.agent_id, DEMO_FARMER_PHONE]
  );
}

async function ensureDemoCentreManagers(): Promise<void> {
  await query(
    `UPDATE aggregation_centres SET
      manager_name = 'Kiambu Agent',
      manager_phone = $1
     WHERE centre_id = 'ke-kiambu-01'`,
    [DEMO_AGENT_PHONE]
  );
}

/** Demo aggregation centre login: +254700000003 / 12345 */
export async function ensureDemoAgentPassword(): Promise<void> {
  const { hashPassword } = await import('./services/encryptionService');
  const hash = await hashPassword('12345');
  await query('UPDATE users SET password_hash = $1 WHERE phone_number = $2', [hash, '+254700000003']);
}

/** Demo payments only — legacy farmer_projects enrollment removed pending Phase 2. */
async function ensureDemoFarmerPayments(farmerId: string): Promise<void> {
  const hasPayment = await queryOne<{ id: string }>(
    'SELECT id FROM payments WHERE farmer_id = $1 LIMIT 1',
    [farmerId]
  );
  if (hasPayment) return;

  await query(
    `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), farmerId, 'Coffee Training', 15000, 'pending', 'M-Pesa']
  );

  await query(
    `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method, mpesa_reference, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '30 days')`,
    [uuidv4(), farmerId, 'Soil Health', 8000, 'transferred', 'M-Pesa', 'MPX123456']
  );
}
