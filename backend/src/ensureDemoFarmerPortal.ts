import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from './db/database';
import { createUser } from './services/userService';
import { ensureMembershipGroup } from './services/farmerService';
import { encryptField, hashIdNumber } from './services/encryptionService';

const DEMO_FARMER_PHONE = '+254712345678';
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
  await ensureMembershipGroup(DEMO_FARMER.membershipGroup);
  const farmerId = await ensureDemoFarmerRecord();
  if (!farmerId) {
    console.warn('Demo farmer record could not be created');
    return;
  }

  await ensureDemoFarmerUser(farmerId);
  await ensureDemoStaffUsers();
  await ensureDemoFarmerPayments(farmerId);
  console.log(`Demo farmer portal ready: ${DEMO_FARMER.name} (${farmerId.slice(0, 8)}…)`);
}

async function ensureDemoFarmerRecord(): Promise<string | null> {
  const existing = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE phone_number = $1',
    [DEMO_FARMER_PHONE]
  );
  if (existing) return existing.farmer_id;

  const groupId = await ensureMembershipGroup(DEMO_FARMER.membershipGroup);
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
      'Kiambu Town Hall',
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
      phone: '+254700000003',
      name: 'Kiambu Agent',
      role: 'agent' as const,
      district: 'Kiambu',
      aggregationCenter: 'Kiambu Town Hall',
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
        aggregationCenter: 'aggregationCenter' in s ? s.aggregationCenter : undefined,
      });
    }
  }
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
