import { query, queryOne } from '../db/database';
import { logAudit } from './auditService';
import { processPaymentViaBanking } from './bankingService';
import { isLocationPending } from './farmerService';
import {
  getFarmerActiveProjectSummaries,
  getFarmerProjectSummaries,
} from './farmerProgramService';
import { getFarmerSupportContacts } from './farmerHelpRequestService';
import { resolvePhotoUrlForDisplay } from './r2StorageService';

export async function getFarmerDashboard(farmerId: string) {
  const farmer = await queryOne(
    `SELECT f.*, mg.name as membership_group_name
     FROM farmers f
     JOIN membership_groups mg ON f.membership_group_id = mg.id
     WHERE f.farmer_id = $1`,
    [farmerId]
  );

  if (!farmer) return null;

  const pendingPayments = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments
     WHERE farmer_id = $1 AND payment_status = 'pending'`,
    [farmerId]
  );

  const totalEarnings = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments
     WHERE farmer_id = $1 AND payment_status = 'transferred'`,
    [farmerId]
  );

  const activeProjects = await getFarmerActiveProjectSummaries(farmerId);
  const sortedActive = [...activeProjects].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  const contacts = await getFarmerSupportContacts(farmerId);

  const farmerRecord = farmer as Record<string, unknown> & {
    aggregation_center?: string | null;
    district: string;
    sub_county: string;
    picture_url?: string | null;
  };

  const picture_url = await resolvePhotoUrlForDisplay(
    typeof farmerRecord.picture_url === 'string' ? farmerRecord.picture_url : null
  );

  return {
    farmer: {
      ...farmerRecord,
      picture_url,
      profileLocationPending: isLocationPending(farmer as { district: string; sub_county: string }),
      aggregation_center:
        farmerRecord.aggregation_center ??
        contacts.aggregationCentre?.name ??
        null,
      registered_agent_name: contacts.fieldAgent?.name ?? null,
      registered_agent_phone: contacts.fieldAgent?.phone ?? null,
      aggregation_centre_contact: contacts.aggregationCentre?.managerPhone ?? null,
      centre_location: contacts.aggregationCentre?.location ?? null,
      banking_agent_name: contacts.bankingAgent?.name ?? null,
      banking_agent_phone: contacts.bankingAgent?.phone ?? null,
    },
    contacts,
    pendingAmount: pendingPayments?.total ?? 0,
    totalEarnings: totalEarnings?.total ?? 0,
    activeProjects: sortedActive,
    nextProject: sortedActive[0] ?? null,
  };
}

export async function getFarmerProjects(farmerId: string) {
  return getFarmerProjectSummaries(farmerId);
}

export async function getFarmerPayments(farmerId: string) {
  return query(
    `SELECT * FROM payments WHERE farmer_id = $1 ORDER BY created_at DESC`,
    [farmerId]
  );
}

export async function getFarmerNotifications(userId: string) {
  return query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
}

export async function claimPayment(farmerId: string, paymentId: string, initiatedBy?: string) {
  const payment = await queryOne<{ id: string; amount: number; verification_status: string }>(
    `SELECT * FROM payments WHERE id = $1 AND farmer_id = $2 AND payment_status = 'pending'`,
    [paymentId, farmerId]
  );

  if (!payment) return { success: false, error: 'Payment not found or already claimed' };

  if (payment.verification_status === 'unverified' && process.env.REQUIRE_PAYMENT_VERIFICATION === 'true') {
    return { success: false, error: 'Payment pending agent verification' };
  }

  if (process.env.USE_EQUITY_H2H === 'true' && initiatedBy) {
    const result = await processPaymentViaBanking(paymentId, initiatedBy);
    await logAudit({
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
  await query(
    `UPDATE payments SET payment_status = 'transferred', mpesa_reference = $1, paid_at = NOW()
     WHERE id = $2`,
    [ref, paymentId]
  );

  await logAudit({
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
