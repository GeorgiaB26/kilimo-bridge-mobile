import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { UserRole } from '../../../shared/src/roles';

export function getAllUsers() {
  return db.prepare(`
    SELECT user_id, phone_number, name, role, farmer_id, district, region, aggregation_center, status, created_at
    FROM users ORDER BY created_at DESC
  `).all();
}

export function createUser(data: {
  phoneNumber: string;
  name: string;
  role: UserRole | string;
  farmerId?: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  passwordHash?: string;
}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO users (user_id, phone_number, name, role, farmer_id, district, region, aggregation_center, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.phoneNumber, data.name, data.role,
    data.farmerId ?? null, data.district ?? null,
    data.region ?? null, data.aggregationCenter ?? null,
    data.passwordHash ?? null
  );
  return id;
}

export function getAdminStats() {
  const farmers = db.prepare('SELECT COUNT(*) as count FROM farmers').get() as { count: number };
  const users = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const agents = db.prepare(`SELECT COUNT(*) as count FROM agents WHERE status = 'active'`).get() as { count: number };
  const pendingPayments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_status = 'Pending'
  `).get() as { total: number };
  const activeProjects = db.prepare(`
    SELECT COUNT(*) as count FROM farmer_projects WHERE status IN ('Assigned', 'In Progress')
  `).get() as { count: number };
  const recentImports = db.prepare(`
    SELECT id, status, imported_count, total_rows, created_at FROM import_sessions
    ORDER BY created_at DESC LIMIT 5
  `).all();
  const pendingBankTx = db.prepare(`
    SELECT COUNT(*) as count FROM bank_transactions WHERE status IN ('pending', 'timeout')
  `).get() as { count: number };

  return {
    totalFarmers: farmers.count,
    totalUsers: users.count,
    activeAgents: agents.count,
    pendingPaymentsTotal: pendingPayments.total,
    pendingBankTransactions: pendingBankTx.count,
    activeProjects: activeProjects.count,
    recentImports,
  };
}

export function linkFarmerToUser(farmerId: string, phone: string, name: string) {
  const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(phone);
  if (existing) return;
  createUser({ phoneNumber: phone, name, role: 'farmer', farmerId });
}

export function getUserByPhone(phone: string) {
  return db.prepare(`SELECT * FROM users WHERE phone_number = ?`).get(phone) as {
    user_id: string;
    password_hash: string | null;
    role: string;
    name: string;
    farmer_id: string | null;
    district: string | null;
    region: string | null;
  } | undefined;
}
