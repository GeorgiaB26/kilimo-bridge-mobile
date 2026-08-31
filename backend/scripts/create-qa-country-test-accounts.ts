/**
 * Create Kenya + Uganda QA farmer/agent accounts for mobile OTP testing.
 * Run from backend/: npx tsx scripts/create-qa-country-test-accounts.ts
 *
 * Idempotent: existing phones are updated to verified/active + users rows.
 */
import { closeDatabase, query, queryOne } from '../src/db/database';
import { createFarmer, ensureMembershipGroup } from '../src/services/farmerService';
import { registerAgent } from '../src/services/agentService';
import { linkFarmerToUser } from '../src/services/userService';
import { seedAggregationCentres } from '../src/services/aggregationCentreService';
import { requestOtp, verifyOtp } from '../src/services/authService';

/** Minimal valid JPEG data URL (>100 chars) so photo-required UI is not blocked. */
const QA_PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

type FarmerSpec = {
  key: string;
  name: string;
  phone: string;
  gender: 'M' | 'F';
  idNumber: string;
  membershipGroup: string;
  country: string;
  district: string;
  subCounty: string;
  parish: string;
  village: string;
  aggregationCenter: string;
};

type AgentSpec = {
  name: string;
  phone: string;
  governmentId: string;
  aggregationCenter: string;
  region: string;
  district: string;
};

const FARMERS: FarmerSpec[] = [
  {
    key: 'QA-KE-F-001',
    name: 'QA Kenya Farmer',
    phone: '+254711000001',
    gender: 'F',
    idNumber: '9911000001',
    membershipGroup: 'Kiambu Cooperative',
    country: 'Kenya',
    district: 'Kiambu',
    subCounty: 'Limuru',
    parish: 'Ndeiya',
    village: 'Ndeiya',
    aggregationCenter: 'Kiambu Town Hall',
  },
  {
    key: 'QA-UG-F-001',
    name: 'QA Uganda Farmer',
    phone: '+256771000001',
    gender: 'F',
    idNumber: '9911000002',
    membershipGroup: 'Gulu Women Economic Dev',
    country: 'Uganda',
    district: 'Gulu',
    subCounty: 'Central',
    parish: 'Layibi',
    village: 'Layibi',
    aggregationCenter: 'Gulu Centre',
  },
];

const AGENTS: AgentSpec[] = [
  {
    name: 'QA Kenya Field Agent',
    phone: '+254711000002',
    governmentId: 'QA-KE-A-GOV-001',
    aggregationCenter: 'Kiambu Town Hall',
    region: 'Central',
    district: 'Kiambu',
  },
  {
    name: 'QA Uganda Field Agent',
    phone: '+256771000002',
    governmentId: 'QA-UG-A-GOV-001',
    aggregationCenter: 'Gulu Centre',
    region: 'Northern',
    district: 'Gulu',
  },
];

async function ensureFarmer(spec: FarmerSpec): Promise<string> {
  await ensureMembershipGroup(spec.membershipGroup);
  const existing = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE phone_number = $1',
    [spec.phone]
  );

  let farmerId: string;
  if (existing) {
    farmerId = existing.farmer_id;
    console.log(`  farmer exists ${spec.phone} → ${farmerId.slice(0, 8)}… (updating)`);
    const groupId = await queryOne<{ id: string }>(
      'SELECT id FROM membership_groups WHERE name = $1',
      [spec.membershipGroup]
    );
    await query(
      `UPDATE farmers SET
         name = $1, country = $2, district = $3, sub_county = $4,
         parish = $5, village = $6, ward = $7, aggregation_center = $8,
         membership_group_id = COALESCE($9, membership_group_id),
         picture_url = COALESCE(NULLIF(picture_url, ''), $10),
         status = 'verified', updated_at = NOW()
       WHERE farmer_id = $11`,
      [
        spec.name,
        spec.country,
        spec.district,
        spec.subCounty,
        spec.parish,
        spec.village,
        spec.parish,
        spec.aggregationCenter,
        groupId?.id ?? null,
        QA_PHOTO,
        farmerId,
      ]
    );
  } else {
    farmerId = await createFarmer({
      key: spec.key,
      name: spec.name,
      gender: spec.gender,
      idNumber: spec.idNumber,
      membershipGroup: spec.membershipGroup,
      aggregationCenter: spec.aggregationCenter,
      phone: spec.phone,
      country: spec.country,
      district: spec.district,
      subCounty: spec.subCounty,
      parish: spec.parish,
      village: spec.village,
      ward: spec.parish,
      membershipType: 'Active',
      picture: QA_PHOTO,
      skipProjectEnrolment: true,
    });
    console.log(`  created farmer ${spec.phone} → ${farmerId.slice(0, 8)}…`);
  }

  await query(`UPDATE farmers SET status = 'verified', updated_at = NOW() WHERE farmer_id = $1`, [
    farmerId,
  ]);
  await linkFarmerToUser(farmerId, spec.phone, spec.name, {
    district: spec.district,
    aggregationCenter: spec.aggregationCenter,
  });
  await query(`UPDATE users SET status = 'active' WHERE phone_number = $1`, [spec.phone]);
  return farmerId;
}

async function ensureAgent(spec: AgentSpec): Promise<string> {
  const existingUser = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [spec.phone]
  );
  const existingAgent = existingUser
    ? await queryOne<{ agent_id: string }>(
        'SELECT agent_id FROM agents WHERE user_id = $1',
        [existingUser.user_id]
      )
    : null;

  let agentId: string;
  if (existingAgent) {
    agentId = existingAgent.agent_id;
    console.log(`  agent exists ${spec.phone} → ${agentId.slice(0, 8)}… (activating)`);
    await query(
      `UPDATE agents SET
         aggregation_center = $1, region = $2, district = $3,
         status = 'active', verified_at = NOW()
       WHERE agent_id = $4`,
      [spec.aggregationCenter, spec.region, spec.district, agentId]
    );
    await query(
      `UPDATE users SET name = $1, role = 'agent', district = $2, region = $3,
         aggregation_center = $4, status = 'active'
       WHERE user_id = $5`,
      [spec.name, spec.district, spec.region, spec.aggregationCenter, existingUser!.user_id]
    );
  } else {
    const result = await registerAgent({
      phoneNumber: spec.phone,
      name: spec.name,
      governmentId: spec.governmentId,
      aggregationCenter: spec.aggregationCenter,
      region: spec.region,
      district: spec.district,
    });
    agentId = result.agentId;
    console.log(`  created agent ${spec.phone} → ${agentId.slice(0, 8)}…`);
    await query(
      `UPDATE agents SET status = 'active', verified_at = NOW() WHERE agent_id = $1`,
      [agentId]
    );
    await query(`UPDATE users SET status = 'active' WHERE user_id = $1`, [result.userId]);
  }
  return agentId;
}

async function proveOtpLogin(phone: string): Promise<{ name: string; role: string }> {
  const requested = await requestOtp(phone);
  if (!requested.success) {
    throw new Error(`requestOtp failed for ${phone}: ${requested.message}`);
  }
  if (requested.devCode !== '123456') {
    throw new Error(`Expected dev OTP 123456 for ${phone}, got ${requested.devCode ?? '(none)'}`);
  }
  const verified = await verifyOtp(phone, '123456', 'qa-script');
  if (!verified.success || !verified.token || !verified.user) {
    throw new Error(`verifyOtp failed for ${phone}: ${verified.error ?? 'unknown'}`);
  }
  return { name: verified.user.name, role: verified.user.role };
}

async function printSummary(): Promise<void> {
  const rows = await query<{
    phone_number: string;
    name: string;
    role: string;
    status: string;
    farmer_id: string | null;
    district: string | null;
    region: string | null;
    farmer_status: string | null;
    farmer_country: string | null;
    agent_status: string | null;
    agent_district: string | null;
  }>(
    `SELECT u.phone_number, u.name, u.role::text AS role, u.status::text AS status,
            u.farmer_id::text AS farmer_id, u.district, u.region,
            f.status::text AS farmer_status, f.country AS farmer_country,
            a.status::text AS agent_status, a.district AS agent_district
     FROM users u
     LEFT JOIN farmers f ON f.farmer_id = u.farmer_id
     LEFT JOIN agents a ON a.user_id = u.user_id
     WHERE u.phone_number = ANY($1)
     ORDER BY u.phone_number`,
    [['+254711000001', '+254711000002', '+256771000001', '+256771000002']]
  );
  console.log('\nAccount summary:');
  for (const row of rows) {
    const extra =
      row.role === 'farmer'
        ? `farmer.status=${row.farmer_status} country=${row.farmer_country}`
        : `agent.status=${row.agent_status} district=${row.agent_district}`;
    console.log(
      `  ${row.phone_number}  ${row.name}  users.role=${row.role} users.status=${row.status}  ${extra}`
    );
  }
  if (rows.length !== 4) {
    throw new Error(`Expected 4 users, found ${rows.length}`);
  }
  for (const row of rows) {
    if (row.status !== 'active') throw new Error(`${row.phone_number} users.status is ${row.status}`);
    if (row.role === 'farmer' && row.farmer_status !== 'verified') {
      throw new Error(`${row.phone_number} farmer.status is ${row.farmer_status}`);
    }
    if (row.role === 'agent' && row.agent_status !== 'active') {
      throw new Error(`${row.phone_number} agent.status is ${row.agent_status}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('Seeding aggregation centres…');
  await seedAggregationCentres();

  console.log('Creating QA farmers…');
  for (const farmer of FARMERS) {
    await ensureFarmer(farmer);
  }

  console.log('Creating QA agents…');
  for (const agent of AGENTS) {
    await ensureAgent(agent);
  }

  await printSummary();

  console.log('\nProving OTP login (in-process) for Kenya farmer…');
  const login = await proveOtpLogin('+254711000001');
  console.log(`  OK: ${login.name} (${login.role}) token issued with OTP 123456`);
}

main()
  .then(() => closeDatabase())
  .catch(async (err) => {
    console.error('Failed:', err instanceof Error ? err.message : err);
    await closeDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
