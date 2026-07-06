import { db } from '../db/database';

export function getFarmerDashboard(farmerId: string) {
  const farmer = db.prepare(`
    SELECT f.*, mg.name as membership_group_name
    FROM farmers f
    JOIN membership_groups mg ON f.membership_group_id = mg.id
    WHERE f.farmer_id = ?
  `).get(farmerId);

  if (!farmer) return null;

  const projects = db.prepare(`
    SELECT * FROM farmer_projects WHERE farmer_id = ? ORDER BY created_at DESC
  `).all(farmerId);

  const pendingPayments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE farmer_id = ? AND payment_status = 'Pending'
  `).get(farmerId) as { total: number };

  const totalEarnings = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE farmer_id = ? AND payment_status = 'Transferred'
  `).get(farmerId) as { total: number };

  const activeProjects = (projects as { status: string }[]).filter(
    (p) => p.status === 'In Progress' || p.status === 'Assigned'
  );

  return {
    farmer,
    pendingAmount: pendingPayments.total,
    totalEarnings: totalEarnings.total,
    activeProjects,
    nextProject: activeProjects[0] ?? null,
  };
}

export function getFarmerProjects(farmerId: string) {
  return db.prepare(`
    SELECT * FROM farmer_projects WHERE farmer_id = ? ORDER BY created_at DESC
  `).all(farmerId);
}

export function getFarmerPayments(farmerId: string) {
  return db.prepare(`
    SELECT * FROM payments WHERE farmer_id = ? ORDER BY created_at DESC
  `).all(farmerId);
}

export function getFarmerNotifications(userId: string) {
  return db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(userId);
}

export function claimPayment(farmerId: string, paymentId: string) {
  const payment = db.prepare(`
    SELECT * FROM payments WHERE id = ? AND farmer_id = ? AND payment_status = 'Pending'
  `).get(paymentId, farmerId) as { id: string; amount: number } | undefined;

  if (!payment) return { success: false, error: 'Payment not found or already claimed' };

  const ref = `MPX${Date.now()}`;
  db.prepare(`
    UPDATE payments SET payment_status = 'Transferred', mpesa_reference = ?, paid_at = datetime('now')
    WHERE id = ?
  `).run(ref, paymentId);

  return { success: true, reference: ref, amount: payment.amount };
}
