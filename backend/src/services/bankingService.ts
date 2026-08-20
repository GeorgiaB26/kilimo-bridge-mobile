import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { encryptField, decryptField, hashPassword, hashIdNumber } from './encryptionService';
import { logAudit } from './auditService';

const EQUITY_API_URL = process.env.EQUITY_H2H_URL || 'https://api.equitybank.co.ke/h2h/v1';
const EQUITY_API_KEY = process.env.EQUITY_API_KEY || '';
const EQUITY_TIMEOUT_MS = parseInt(process.env.EQUITY_TIMEOUT_MS || '30000', 10);

interface H2HTransferRequest {
  paymentId: string;
  farmerId: string;
  amount: number;
  recipientPhone: string;
  initiatedBy: string;
}

interface H2HTransferResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  error?: string;
  /** API response status — DB uses bank_transaction_status enum (no 'timeout'; stored as 'processing'). */
  status: 'pending' | 'completed' | 'failed' | 'timeout';
}

/** Initiate M-Pesa disbursement via Equity Bank H2H API */
export async function initiateH2HTransfer(req: H2HTransferRequest): Promise<H2HTransferResult> {
  const txId = uuidv4();

  await query(
    `INSERT INTO bank_transactions (
      id, payment_id, farmer_id, amount, recipient_phone, status, initiated_by
    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
    [txId, req.paymentId, req.farmerId, req.amount, req.recipientPhone, req.initiatedBy]
  );

  await logAudit({
    userId: req.initiatedBy,
    action: 'payment.h2h_request',
    category: 'financial',
    resourceType: 'payment',
    resourceId: req.paymentId,
    details: { amount: req.amount, txId },
    success: true,
  });

  // Dev/simulation mode when no API key configured or non-production
  if (!EQUITY_API_KEY || process.env.NODE_ENV !== 'production') {
    const ref = `EQX${Date.now()}`;
    await simulateBankDelay();
    await query(
      `UPDATE bank_transactions SET status = 'completed', equity_reference = $1, completed_at = NOW()
       WHERE id = $2`,
      [ref, txId]
    );
    const { settleTransferredPayment } = await import('./hierarchyService');
    await settleTransferredPayment(req.paymentId, ref);
    return { success: true, transactionId: txId, reference: ref, status: 'completed' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EQUITY_TIMEOUT_MS);

    const response = await fetch(`${EQUITY_API_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EQUITY_API_KEY}`,
        'X-Request-ID': txId,
      },
      body: JSON.stringify({
        amount: req.amount,
        currency: 'KES',
        recipient: { phone: req.recipientPhone },
        reference: req.paymentId,
        narration: 'Kilimo Bridge farmer payment',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = (await response.json()) as { reference?: string; status?: string; message?: string };

    if (!response.ok) {
      const error = data.message || `Bank API error: ${response.status}`;
      await query(
        `UPDATE bank_transactions SET status = 'failed', error_message = $1, equity_response = $2 WHERE id = $3`,
        [error, JSON.stringify(data), txId]
      );
      await logAudit({
        userId: req.initiatedBy,
        action: 'payment.h2h_request',
        category: 'financial',
        resourceId: req.paymentId,
        details: { error, txId },
        success: false,
      });
      return { success: false, transactionId: txId, error, status: 'failed' };
    }

    await query(
      `UPDATE bank_transactions SET status = 'pending', equity_reference = $1, equity_response = $2
       WHERE id = $3`,
      [data.reference ?? null, JSON.stringify(data), txId]
    );

    return { success: true, transactionId: txId, reference: data.reference, status: 'pending' };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const error = isTimeout ? 'Bank API timeout — transaction queued for retry' : String(err);
    /** Postgres bank_transaction_status has no 'timeout' — use 'processing' for queued retry. */
    const dbStatus = isTimeout ? 'processing' : 'failed';
    await query(`UPDATE bank_transactions SET status = $1, error_message = $2 WHERE id = $3`, [
      dbStatus,
      error,
      txId,
    ]);
    await logAudit({
      userId: req.initiatedBy,
      action: 'payment.h2h_request',
      category: 'financial',
      resourceId: req.paymentId,
      details: { error, txId, timeout: isTimeout },
      success: false,
    });
    return { success: false, transactionId: txId, error, status: isTimeout ? 'timeout' : 'failed' };
  }
}

/** Process webhook from Equity Bank confirming transaction */
export async function handleEquityWebhook(payload: {
  reference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  transactionId?: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  const tx = await queryOne<{ id: string; payment_id: string; status: string }>(
    `SELECT * FROM bank_transactions WHERE equity_reference = $1 OR id = $2`,
    [payload.reference, payload.transactionId ?? null]
  );

  if (!tx) {
    await logAudit({
      action: 'payment.h2h_webhook',
      category: 'financial',
      details: { error: 'unknown_reference', payload },
      success: false,
    });
    return { success: false, error: 'Transaction not found' };
  }

  const newStatus =
    payload.status === 'SUCCESS' ? 'completed' : payload.status === 'FAILED' ? 'failed' : 'pending';

  await query(
    `UPDATE bank_transactions SET status = $1, equity_response = $2, webhook_received_at = NOW(),
      completed_at = CASE WHEN $3 THEN NOW() ELSE completed_at END
     WHERE id = $4`,
    [newStatus, JSON.stringify(payload), newStatus === 'completed', tx.id]
  );

  if (newStatus === 'completed' && tx.payment_id) {
    const { settleTransferredPayment } = await import('./hierarchyService');
    await settleTransferredPayment(tx.payment_id, payload.reference ?? '');
  }

  await logAudit({
    action: 'payment.h2h_webhook',
    category: 'financial',
    resourceType: 'bank_transaction',
    resourceId: tx.id,
    details: { status: payload.status, reference: payload.reference },
    success: payload.status === 'SUCCESS',
  });

  return { success: true };
}

export async function getBankTransactions(filters: { status?: string; limit?: number } = {}) {
  const limit = filters.limit ?? 100;
  if (filters.status) {
    return query(
      `SELECT * FROM bank_transactions WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
      [filters.status, limit]
    );
  }
  return query(`SELECT * FROM bank_transactions ORDER BY created_at DESC LIMIT $1`, [limit]);
}

export async function getPaymentsWithFarmers(limit = 200) {
  return query(
    `SELECT p.*, f.name as farmer_name, f.phone_number, f.district
     FROM payments p
     JOIN farmers f ON p.farmer_id = f.farmer_id
     ORDER BY p.created_at DESC LIMIT $1`,
    [limit]
  );
}

/** Banking MVP — verify national ID against id_number_hash (optionally scoped to farmer_id). */
export async function verifyFarmerIdForBanking(
  idNumber: string,
  farmerId?: string
): Promise<{
  verified: boolean;
  farmer_id?: string;
  name?: string;
  phone_number?: string;
}> {
  const hash = hashIdNumber(idNumber);
  if (!hash) {
    return { verified: false };
  }
  const row = farmerId
    ? await queryOne<{ farmer_id: string; name: string; phone_number: string }>(
        'SELECT farmer_id, name, phone_number FROM farmers WHERE farmer_id = $1 AND id_number_hash = $2',
        [farmerId, hash]
      )
    : await queryOne<{ farmer_id: string; name: string; phone_number: string }>(
        'SELECT farmer_id, name, phone_number FROM farmers WHERE id_number_hash = $1',
        [hash]
      );
  if (!row) {
    return { verified: false };
  }
  return {
    verified: true,
    farmer_id: row.farmer_id,
    name: row.name,
    phone_number: row.phone_number,
  };
}

export async function processPaymentViaBanking(
  paymentId: string,
  initiatedBy: string
): Promise<H2HTransferResult> {
  const payment = await queryOne<{
    id: string;
    farmer_id: string;
    amount: number;
    phone_number: string;
  }>(
    `SELECT p.*, f.phone_number FROM payments p
     JOIN farmers f ON p.farmer_id = f.farmer_id
     WHERE p.id = $1 AND p.payment_status = 'pending'`,
    [paymentId]
  );

  if (!payment) {
    return { success: false, error: 'Payment not found or already processed', status: 'failed' };
  }

  return initiateH2HTransfer({
    paymentId: payment.id,
    farmerId: payment.farmer_id,
    amount: payment.amount,
    recipientPhone: payment.phone_number,
    initiatedBy,
  });
}

async function simulateBankDelay(): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
}

/** Encrypt farmer sensitive fields before storage */
export function encryptFarmerSensitiveFields(farmer: {
  idNumber?: string;
  bankAccount?: string;
}): { id_number_encrypted?: string; bank_account_encrypted?: string } {
  const result: { id_number_encrypted?: string; bank_account_encrypted?: string } = {};
  if (farmer.idNumber) result.id_number_encrypted = encryptField(farmer.idNumber);
  if (farmer.bankAccount) result.bank_account_encrypted = encryptField(farmer.bankAccount);
  return result;
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`, [
    hash,
    userId,
  ]);
}

export { encryptField, decryptField };
