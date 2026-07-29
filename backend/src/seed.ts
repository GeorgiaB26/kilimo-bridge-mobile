import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, getFarmerCount } from './db/database';
import { createUser } from './services/userService';
import { registerAgent } from './services/agentService';
import { seedAggregationCentres } from './services/aggregationCentreService';
import { ensureMembershipGroup } from './services/farmerService';
import { encryptField, hashIdNumber } from './services/encryptionService';
import bcrypt from 'bcryptjs';

const MEMBERSHIP_GROUPS = [
  'Gulu Women Economic Dev',
  'Kiambu Cooperative',
  'Nairobi Women Coop',
  'Test Coop',
];

/** Demo farmer always available for quick login */
const DEMO_FARMER = {
  key: 'DEMO-001',
  name: 'John Doe',
  phone: '+254712345678',
  gender: 'M',
  idNumber: '99999999',
  membershipGroup: 'Test Coop',
  district: 'Kiambu',
  subCounty: 'Limuru',
};

/** Bulk seed for empty databases — skips when imported data already present. */
export async function seedDatabase(): Promise<void> {
  const farmerCount = await getFarmerCount();
  if (farmerCount > 10) {
    return;
  }

  await seedAggregationCentres();

  for (const name of MEMBERSHIP_GROUPS) {
    await ensureMembershipGroup(name);
  }

  await seedDemoFarmerRecord();
  await seedStaffUsers();
  await seedUsers();
  await seedDemoFarmerPayments();
}

async function seedStaffUsers(): Promise<void> {
  const bankingPhone = '+254700000004';
  const existing = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [bankingPhone]
  );
  if (!existing) {
    const passwordHash = bcrypt.hashSync('Banking@2026', 12);
    await createUser({
      phoneNumber: bankingPhone,
      name: 'Equity Banking Officer',
      role: 'banking_agent',
      passwordHash,
    });
  }

  const agentPhone = '+254700000003';
  const agentExists = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [agentPhone]
  );
  if (!agentExists) {
    try {
      const { agentId } = await registerAgent({
        phoneNumber: agentPhone,
        name: 'Kiambu Agent',
        governmentId: 'GOV-AGENT-001',
        aggregationCenter: 'Kiambu Town Hall',
        region: 'Central',
        district: 'Kiambu',
      });
      await query(
        `UPDATE agents SET status = 'active', verified_at = NOW() WHERE agent_id = $1`,
        [agentId]
      );
    } catch {
      await createUser({
        phoneNumber: agentPhone,
        name: 'Kiambu Agent',
        role: 'agent',
        district: 'Kiambu',
        region: 'Central',
        aggregationCenter: 'Kiambu Town Hall',
      });
    }
  }
}

async function seedDemoFarmerRecord(): Promise<void> {
  const existing = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE phone_number = $1',
    [DEMO_FARMER.phone]
  );
  if (existing) return;

  const groupId = await ensureMembershipGroup(DEMO_FARMER.membershipGroup);
  if (!groupId) return;

  await query(
    `INSERT INTO farmers (
      farmer_id, key, name, gender, id_number_encrypted, id_number_hash, membership_group_id,
      phone_number, phone_country_prefix, country, district, sub_county, membership_type, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      uuidv4(),
      DEMO_FARMER.key,
      DEMO_FARMER.name,
      DEMO_FARMER.gender,
      encryptField(DEMO_FARMER.idNumber),
      hashIdNumber(DEMO_FARMER.idNumber),
      groupId,
      DEMO_FARMER.phone,
      '+254',
      'Kenya',
      DEMO_FARMER.district,
      DEMO_FARMER.subCounty,
      'Active',
      'verified',
    ]
  );
}

async function seedUsers(): Promise<void> {
  const users = [
    { phone: '+254700000001', name: 'Super Admin', role: 'super_admin' as const },
    { phone: '+254700000002', name: 'Platform Admin', role: 'platform_admin' as const },
  ];

  for (const u of users) {
    const existing = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [u.phone]
    );
    if (!existing) {
      await createUser({ phoneNumber: u.phone, name: u.name, role: u.role });
    }
  }

  const farmers = await query<{ farmer_id: string; phone_number: string; name: string }>(
    'SELECT farmer_id, phone_number, name FROM farmers LIMIT 10'
  );

  for (const f of farmers) {
    const existing = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [f.phone_number]
    );
    if (!existing) {
      await createUser({
        phoneNumber: f.phone_number,
        name: f.name,
        role: 'farmer',
        farmerId: f.farmer_id,
      });
    }
  }
}

async function seedDemoFarmerPayments(): Promise<void> {
  const farmers = await query<{ farmer_id: string }>('SELECT farmer_id FROM farmers LIMIT 5');

  for (const { farmer_id } of farmers) {
    const hasPayment = await queryOne<{ id: string }>(
      'SELECT id FROM payments WHERE farmer_id = $1 LIMIT 1',
      [farmer_id]
    );
    if (hasPayment) continue;

    await query(
      `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), farmer_id, 'Coffee Training', 15000, 'pending', 'M-Pesa']
    );

    await query(
      `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method, mpesa_reference, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '30 days')`,
      [uuidv4(), farmer_id, 'Soil Health', 8000, 'transferred', 'M-Pesa', 'MPX123456']
    );

    const user = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE farmer_id = $1',
      [farmer_id]
    );
    if (user) {
      const hasNotif = await queryOne<{ id: string }>(
        'SELECT id FROM notifications WHERE user_id = $1 LIMIT 1',
        [user.user_id]
      );
      if (!hasNotif) {
        await query(
          `INSERT INTO notifications (id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)`,
          [
            uuidv4(),
            user.user_id,
            'Payment Ready',
            'Your M-Pesa payment of 15,000 KES is ready to claim',
            'payment',
          ]
        );
        await query(
          `INSERT INTO notifications (id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)`,
          [
            uuidv4(),
            user.user_id,
            'New Project',
            'Coffee Training project assigned — 60% complete',
            'project',
          ]
        );
      }
    }
  }
}
