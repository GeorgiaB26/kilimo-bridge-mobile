import { query, queryOne } from '../db/database';
import { encryptField, decryptField, hashPassword, hashIdNumber } from './encryptionService';

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
