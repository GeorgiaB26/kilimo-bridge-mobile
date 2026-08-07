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
import { countTaskCategories } from '../utils/taskCategorization';
import { listFarmerTasks } from './hierarchyService';
import { listAgentTasksAssignedToFarmer } from './agentDashboardService';

export type FarmerPortalTaskRow = {
  id: string;
  name: string;
  status: string;
  due_date?: string | null;
  description?: string | null;
  payment_value_kes?: number;
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  source: 'hierarchy' | 'agent_assignment';
  task_order?: number;
  notes?: string | null;
  photo_evidence_url?: string | null;
  rejection_reason?: string | null;
};

function mapAgentStatusToFarmer(status: string): string {
  return status.replace(/_/g, '-');
}

function mapAgentTaskToFarmerRow(
  row: Awaited<ReturnType<typeof listAgentTasksAssignedToFarmer>>[number]
): FarmerPortalTaskRow {
  return {
    id: row.id,
    name: row.name,
    status: mapAgentStatusToFarmer(row.status),
    due_date: row.due_date,
    description: row.description ?? null,
    payment_value_kes: 0,
    program_project_name: 'Field agent assignment',
    assigned_at: row.created_at,
    assigned_by_name: row.assigned_by_name ?? 'Your field agent',
    source: 'agent_assignment',
    task_order: 0,
  };
}

function mapHierarchyTaskToFarmerRow(row: Record<string, unknown>): FarmerPortalTaskRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    status: String(row.status ?? 'not-started'),
    due_date: row.due_date as string | null | undefined,
    description: row.description as string | null | undefined,
    payment_value_kes: Number(row.payment_value_kes ?? 0),
    program_project_name: row.program_project_name as string | undefined,
    assigned_at: (row.assigned_at ?? row.created_at) as string | undefined,
    assigned_by_name: row.assigned_by_name as string | undefined,
    source: 'hierarchy',
    task_order: row.task_order as number | undefined,
    notes: row.notes as string | null | undefined,
    photo_evidence_url: row.photo_evidence_url as string | null | undefined,
    rejection_reason: row.rejection_reason as string | null | undefined,
  };
}

function sortFarmerPortalTasks(tasks: FarmerPortalTaskRow[]): FarmerPortalTaskRow[] {
  return [...tasks].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date.includes('T') ? a.due_date : `${a.due_date}T12:00:00`) : null;
    const db = b.due_date ? new Date(b.due_date.includes('T') ? b.due_date : `${b.due_date}T12:00:00`) : null;
    if (!da && !db) return a.name.localeCompare(b.name);
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });
}

export async function listAllFarmerAssignedTasks(
  farmerId: string,
  filters?: { status?: string; program_project_id?: string; outstanding?: boolean }
): Promise<FarmerPortalTaskRow[]> {
  const hierarchyRows = (await listFarmerTasks(farmerId, filters)) as Record<string, unknown>[];
  const hierarchyTasks = hierarchyRows.map(mapHierarchyTaskToFarmerRow);

  if (filters?.program_project_id) {
    return sortFarmerPortalTasks(hierarchyTasks);
  }

  const agentRows = await listAgentTasksAssignedToFarmer(farmerId);
  let agentTasks = agentRows.map(mapAgentTaskToFarmerRow);

  if (filters?.status) {
    const want = filters.status.replace(/_/g, '-');
    agentTasks = agentTasks.filter((t) => t.status.replace(/_/g, '-') === want);
  }
  if (filters?.outstanding) {
    agentTasks = agentTasks.filter(
      (t) => !['approved', 'completed'].includes(t.status.replace(/_/g, '-'))
    );
  }

  return sortFarmerPortalTasks([...hierarchyTasks, ...agentTasks]);
}

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

  const allAssignedTasks = await listAllFarmerAssignedTasks(farmerId);
  const categoryCounts = countTaskCategories(
    allAssignedTasks.map((task) => ({
      status: task.status,
      due_date: task.due_date,
    }))
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
    paymentSummary: await getFarmerPaymentSummary(farmerId),
    taskStats: {
      overdue: categoryCounts.overdue,
      in_progress: categoryCounts.inProgress,
      not_started: categoryCounts.notStarted,
      completed: categoryCounts.completed,
      total: categoryCounts.total,
    },
    recentTasks: allAssignedTasks.slice(0, 3),
    assignedTaskCount: allAssignedTasks.length,
    activeProjects: sortedActive,
    nextProject: sortedActive[0] ?? null,
  };
}

export async function getFarmerProjects(farmerId: string) {
  return getFarmerProjectSummaries(farmerId);
}

export async function getFarmerPayments(farmerId: string) {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM payments WHERE farmer_id = $1 ORDER BY created_at DESC`,
    [farmerId]
  );
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
    project_name: String(row.description ?? row.project_name ?? 'Payment'),
    payment_status: normalizePaymentStatusLabel(String(row.payment_status ?? '')),
    amount: Number(row.amount ?? 0),
    created_at: row.created_at ? String(row.created_at) : '',
    mpesa_reference: row.mpesa_reference ? String(row.mpesa_reference) : undefined,
    payment_method: row.payment_method ? String(row.payment_method) : 'M-Pesa',
  }));
}

function normalizePaymentStatusLabel(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'transferred' || lower === 'paid') return 'Transferred';
  if (lower === 'pending') return 'Pending';
  if (lower === 'processing') return 'Processing';
  return status || 'Pending';
}

export async function getFarmerPaymentSummary(farmerId: string) {
  const allPayments = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments WHERE farmer_id = $1`,
    [farmerId]
  );

  const transferred = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments
     WHERE farmer_id = $1 AND lower(payment_status::text) IN ('transferred', 'paid')`,
    [farmerId]
  );

  const pending = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments
     WHERE farmer_id = $1 AND lower(payment_status::text) IN ('pending', 'processing')`,
    [farmerId]
  );

  const expected = await queryOne<{ total: number }>(
    `
    SELECT COALESCE(SUM(t.payment_value_kes), 0)::float AS total
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    WHERE ft.farmer_id = $1
      AND ft.status NOT IN ('approved', 'completed', 'submitted')
    `,
    [farmerId]
  );

  const transferredTotal = transferred?.total ?? 0;
  const pendingTotal = pending?.total ?? 0;
  const expectedTotal = expected?.total ?? 0;
  const allPaymentsTotal = allPayments?.total ?? 0;

  return {
    transferred: transferredTotal,
    pending: pendingTotal,
    expected: expectedTotal,
    completed: transferredTotal,
    allPayments: allPaymentsTotal,
    total: allPaymentsTotal,
  };
}

export async function getFarmerTaskSnapshotStats(farmerId: string) {
  const tasks = await listAllFarmerAssignedTasks(farmerId);
  const counts = countTaskCategories(
    tasks.map((task) => ({
      status: task.status,
      due_date: task.due_date,
    }))
  );

  return {
    overdue: counts.overdue,
    in_progress: counts.inProgress,
    not_started: counts.notStarted,
    completed: counts.completed,
    total: counts.total,
  };
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
