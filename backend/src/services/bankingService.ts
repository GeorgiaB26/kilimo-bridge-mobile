import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { encryptField, decryptField, hashPassword } from './encryptionService';
import { logAudit } from './auditService';
import { createUser } from './userService';

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
  status: 'pending' | 'completed' | 'failed' | 'timeout';
}

/** Initiate M-Pesa disbursement via Equity Bank H2H API */
export async function initiateH2HTransfer(req: H2HTransferRequest): Promise<H2HTransferResult> {
  const txId = uuidv4();

  db.prepare(`
    INSERT INTO bank_transactions (id, payment_id, farmer_id, amount, recipient_phone, status, initiated_by)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(txId, req.paymentId, req.farmerId, req.amount, req.recipientPhone, req.initiatedBy);

  logAudit({
    userId: req.initiatedBy,
    action: 'payment.h2h_request',
    category: 'financial',
    resourceType: 'payment',
    resourceId: req.paymentId,
    details: { amount: req.amount, txId },
    success: true,
  });

  // Dev/simulation mode when no API key configured
  if (!EQUITY_API_KEY || process.env.NODE_ENV !== 'production') {
    const ref = `EQX${Date.now()}`;
    await simulateBankDelay();
    db.prepare(`
      UPDATE bank_transactions SET status = 'completed', equity_reference = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(ref, txId);
    return { success: true, transactionId: txId, reference: ref, status: 'completed' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EQUITY_TIMEOUT_MS);

    const response = await fetch(`${EQUITY_API_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EQUITY_API_KEY}`,
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
    const data = await response.json() as { reference?: string; status?: string; message?: string };

    if (!response.ok) {
      const error = data.message || `Bank API error: ${response.status}`;
      db.prepare(`UPDATE bank_transactions SET status = 'failed', error_message = ?, equity_response = ? WHERE id = ?`)
        .run(error, JSON.stringify(data), txId);
      logAudit({
        userId: req.initiatedBy,
        action: 'payment.h2h_request',
        category: 'financial',
        resourceId: req.paymentId,
        details: { error, txId },
        success: false,
      });
      return { success: false, transactionId: txId, error, status: 'failed' };
    }

    db.prepare(`
      UPDATE bank_transactions SET status = 'pending', equity_reference = ?, equity_response = ?
      WHERE id = ?
    `).run(data.reference ?? null, JSON.stringify(data), txId);

    return { success: true, transactionId: txId, reference: data.reference, status: 'pending' };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const error = isTimeout ? 'Bank API timeout — transaction queued for retry' : String(err);
    db.prepare(`UPDATE bank_transactions SET status = ?, error_message = ? WHERE id = ?`)
      .run(isTimeout ? 'timeout' : 'failed', error, txId);
    logAudit({
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
export function handleEquityWebhook(payload: {
  reference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  transactionId?: string;
  message?: string;
}): { success: boolean; error?: string } {
  const tx = db.prepare(`
    SELECT * FROM bank_transactions WHERE equity_reference = ? OR id = ?
  `).get(payload.reference, payload.transactionId) as {
    id: string; payment_id: string; status: string;
  } | undefined;

  if (!tx) {
    logAudit({
      action: 'payment.h2h_webhook',
      category: 'financial',
      details: { error: 'unknown_reference', payload },
      success: false,
    });
    return { success: false, error: 'Transaction not found' };
  }

  const newStatus = payload.status === 'SUCCESS' ? 'completed' : payload.status === 'FAILED' ? 'failed' : 'pending';

  db.prepare(`
    UPDATE bank_transactions SET status = ?, equity_response = ?, webhook_received_at = datetime('now'),
    completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
    WHERE id = ?
  `).run(newStatus, JSON.stringify(payload), newStatus, tx.id);

  if (newStatus === 'completed' && tx.payment_id) {
    db.prepare(`
      UPDATE payments SET payment_status = 'Transferred', mpesa_reference = ?, paid_at = datetime('now')
      WHERE id = ?
    `).run(payload.reference, tx.payment_id);
  }

  logAudit({
    action: 'payment.h2h_webhook',
    category: 'financial',
    resourceType: 'bank_transaction',
    resourceId: tx.id,
    details: { status: payload.status, reference: payload.reference },
    success: payload.status === 'SUCCESS',
  });

  return { success: true };
}

export function getBankTransactions(filters: { status?: string; limit?: number } = {}) {
  const limit = filters.limit ?? 100;
  if (filters.status) {
    return db.prepare(`SELECT * FROM bank_transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
      .all(filters.status, limit);
  }
  return db.prepare(`SELECT * FROM bank_transactions ORDER BY created_at DESC LIMIT ?`).all(limit);
}

export function processPaymentViaBanking(paymentId: string, initiatedBy: string): Promise<H2HTransferResult> {
  const payment = db.prepare(`
    SELECT p.*, f.phone_number FROM payments p
    JOIN farmers f ON p.farmer_id = f.farmer_id
    WHERE p.id = ? AND p.payment_status = 'Pending'
  `).get(paymentId) as { id: string; farmer_id: string; amount: number; phone_number: string } | undefined;

  if (!payment) {
    return Promise.resolve({ success: false, error: 'Payment not found or already processed', status: 'failed' });
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
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE user_id = ?`).run(hash, userId);
}

export { encryptField, decryptField };
