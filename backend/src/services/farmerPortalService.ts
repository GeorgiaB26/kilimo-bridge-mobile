import { db } from '../db/database';
import { logAudit } from './auditService';
import { processPaymentViaBanking } from './bankingService';
import { isLocationPending } from './farmerService';

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
    farmer: {
      ...(farmer as Record<string, unknown>),
      profileLocationPending: isLocationPending(farmer as { district: string; sub_county: string }),
    },
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

export async function claimPayment(farmerId: string, paymentId: string, initiatedBy?: string) {
  const payment = db.prepare(`
    SELECT * FROM payments WHERE id = ? AND farmer_id = ? AND payment_status = 'Pending'
  `).get(paymentId, farmerId) as { id: string; amount: number; verification_status: string } | undefined;

  if (!payment) return { success: false, error: 'Payment not found or already claimed' };

  // Require agent verification before farmer can claim (if verification workflow enabled)
  if (payment.verification_status === 'unverified' && process.env.REQUIRE_PAYMENT_VERIFICATION === 'true') {
    return { success: false, error: 'Payment pending agent verification' };
  }

  // Route through Equity H2H when banking integration is active
  if (process.env.USE_EQUITY_H2H === 'true' && initiatedBy) {
    const result = await processPaymentViaBanking(paymentId, initiatedBy);
    logAudit({
      userId: initiatedBy,
      action: 'payment.claim',
      category: 'financial',
      resourceType: 'payment',
      resourceId: paymentId,
      details: { amount: payment.amount, via: 'h2h' },
      success: result.success,
    });
    return result;
  }

  const ref = `MPX${Date.now()}`;
  db.prepare(`
    UPDATE payments SET payment_status = 'Transferred', mpesa_reference = ?, paid_at = datetime('now')
    WHERE id = ?
  `).run(ref, paymentId);

  logAudit({
    userId: farmerId,
    action: 'payment.claim',
    category: 'financial',
    resourceType: 'payment',
    resourceId: paymentId,
    details: { amount: payment.amount, reference: ref },
    success: true,
  });

  return { success: true, reference: ref, amount: payment.amount };
}
