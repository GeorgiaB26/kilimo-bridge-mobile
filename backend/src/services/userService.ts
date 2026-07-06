import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { UserRole } from '../../../shared/src/roles';

export function getAllUsers() {
  return db.prepare(`
    SELECT user_id, phone_number, name, role, farmer_id, district, status, created_at
    FROM users ORDER BY created_at DESC
  `).all();
}

export function createUser(data: {
  phoneNumber: string;
  name: string;
  role: UserRole;
  farmerId?: string;
  district?: string;
}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO users (user_id, phone_number, name, role, farmer_id, district)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.phoneNumber, data.name, data.role, data.farmerId ?? null, data.district ?? null);
  return id;
}

export function getAdminStats() {
  const farmers = db.prepare('SELECT COUNT(*) as count FROM farmers').get() as { count: number };
  const users = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
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

  return {
    totalFarmers: farmers.count,
    totalUsers: users.count,
    pendingPaymentsTotal: pendingPayments.total,
    activeProjects: activeProjects.count,
    recentImports,
  };
}

export function linkFarmerToUser(farmerId: string, phone: string, name: string) {
  const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(phone);
  if (existing) return;
  createUser({ phoneNumber: phone, name, role: 'farmer', farmerId });
}
