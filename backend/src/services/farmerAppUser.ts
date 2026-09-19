import { query, queryOne } from '../db/database';

/**
 * App user id for in-app farmer notifications.
 * Prefer users.farmer_id; fall back to matching the farmer's phone, then heal the link.
 */
export async function resolveFarmerAppUserId(farmerId: string): Promise<string | null> {
  const byFarmerId = await queryOne<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM users WHERE farmer_id::text = $1::text LIMIT 1`,
    [farmerId]
  );
  if (byFarmerId?.user_id) return byFarmerId.user_id;

  const byPhone = await queryOne<{ user_id: string }>(
    `SELECT u.user_id::text AS user_id
     FROM users u
     JOIN farmers f ON f.phone_number = u.phone_number
     WHERE f.farmer_id::text = $1::text
       AND u.role::text = 'farmer'
     LIMIT 1`,
    [farmerId]
  );
  if (!byPhone?.user_id) return null;

  await query(
    `UPDATE users SET farmer_id = $1
     WHERE user_id::text = $2::text AND farmer_id IS NULL`,
    [farmerId, byPhone.user_id]
  );
  return byPhone.user_id;
}
