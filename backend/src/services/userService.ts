import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import type { UserRole } from '../../../shared/src/roles';
import { getCentreCountByCountry } from './aggregationCentreService';
import { countActiveProgramProjects } from './farmerProgramService';

export type UserListRow = {
  user_id: string;
  phone_number: string;
  name: string;
  role: string;
  farmer_id: string | null;
  district: string | null;
  region: string | null;
  aggregation_center: string | null;
  status: string;
  created_at: string;
};

export async function getAllUsers(search?: string): Promise<UserListRow[]> {
  const term = search?.trim();
  if (!term) {
    return query<UserListRow>(`
      SELECT user_id, phone_number, name, role, farmer_id, district, region, aggregation_center, status, created_at
      FROM users ORDER BY created_at DESC
    `);
  }

  const pattern = `%${term}%`;
  const phoneDigits = term.replace(/\D/g, '');
  const clauses = ['name ILIKE $1', 'role::text ILIKE $2', "COALESCE(district, '') ILIKE $3"];
  const params: string[] = [pattern, pattern, pattern];

  if (phoneDigits.length >= 3) {
    clauses.push('phone_number LIKE $4');
    params.push(`%${phoneDigits}%`);
  }

  return query<UserListRow>(`
    SELECT user_id, phone_number, name, role, farmer_id, district, region, aggregation_center, status, created_at
    FROM users
    WHERE ${clauses.join(' OR ')}
    ORDER BY LOWER(name)
    LIMIT 100
  `, params);
}

export async function createUser(data: {
  phoneNumber: string;
  name: string;
  role: UserRole | string;
  farmerId?: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  passwordHash?: string;
}): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO users (
      user_id, phone_number, name, role, farmer_id, district, region, aggregation_center, password_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.phoneNumber,
      data.name,
      data.role,
      data.farmerId ?? null,
      data.district ?? null,
      data.region ?? null,
      data.aggregationCenter ?? null,
      data.passwordHash ?? null,
    ]
  );
  return id;
}

export async function getAdminStats() {
  const farmers = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM farmers');
  const users = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
  const agents = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM agents WHERE status = 'active'`
  );
  const pendingPayments = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments WHERE payment_status = 'pending'
  `);
  const activeProjects = { count: await countActiveProgramProjects() };
  const recentImports = await query(`
    SELECT id, status, imported_count, total_rows, created_at FROM import_sessions
    ORDER BY created_at DESC LIMIT 5
  `);
  const pendingBankTx = await queryOne<{ count: number }>(`
    SELECT COUNT(*)::int AS count FROM bank_transactions WHERE status IN ('pending', 'processing')
  `);

  const farmerCountryRows = await query<{ country: string; count: number }>(
    'SELECT country, COUNT(*)::int AS count FROM farmers GROUP BY country ORDER BY count DESC'
  );
  const farmersByCountry = farmerCountryRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.country] = row.count;
    return acc;
  }, {});
  const centresByCountry = await getCentreCountByCountry();

  return {
    totalFarmers: farmers?.count ?? 0,
    totalUsers: users?.count ?? 0,
    activeAgents: agents?.count ?? 0,
    pendingPaymentsTotal: pendingPayments?.total ?? 0,
    pendingBankTransactions: pendingBankTx?.count ?? 0,
    activeProjects: activeProjects?.count ?? 0,
    recentImports,
    farmersByCountry,
    centresByCountry,
  };
}

export async function linkFarmerToUser(
  farmerId: string,
  phone: string,
  name: string,
  profile?: {
    district?: string | null;
    region?: string | null;
    aggregationCenter?: string | null;
  }
): Promise<void> {
  const existing = await queryOne<{ user_id: string; role: string; farmer_id: string | null }>(
    'SELECT user_id, role::text AS role, farmer_id FROM users WHERE phone_number = $1',
    [phone]
  );
  if (existing) {
    if (existing.role !== 'farmer') {
      throw new Error(`Phone number is already registered as a ${existing.role} account`);
    }
    if (existing.farmer_id && existing.farmer_id !== farmerId) {
      throw new Error('Phone number is already registered to another farmer');
    }
    await query(
      `UPDATE users SET
         farmer_id = $1,
         name = $2,
         district = COALESCE($3, district),
         region = COALESCE($4, region),
         aggregation_center = COALESCE($5, aggregation_center)
       WHERE user_id = $6`,
      [
        farmerId,
        name,
        profile?.district ?? null,
        profile?.region ?? null,
        profile?.aggregationCenter ?? null,
        existing.user_id,
      ]
    );
    return;
  }
  try {
    await createUser({
      phoneNumber: phone,
      name,
      role: 'farmer',
      farmerId,
      district: profile?.district ?? undefined,
      region: profile?.region ?? undefined,
      aggregationCenter: profile?.aggregationCenter ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Could not create farmer login (${message})`);
  }
}

export async function getUserByPhone(phone: string) {
  return queryOne<{
    user_id: string;
    password_hash: string | null;
    role: string;
    name: string;
    farmer_id: string | null;
    district: string | null;
    region: string | null;
  }>('SELECT * FROM users WHERE phone_number = $1', [phone]);
}
