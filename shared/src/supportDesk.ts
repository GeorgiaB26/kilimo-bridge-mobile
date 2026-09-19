/**
 * Support desk identity — KB Support stays super_admin but is routed to the
 * simplified Support app via this allowlist (not a new DB role).
 *
 * Mobile tech-support tickets use message_threads (context_type = support_ticket)
 * + message_support_tickets + /api/support/*. Do not call the Lovable/Postgres
 * RPC `send_tech_support_message` from mobile — that path is legacy portal-only.
 */

/** Canonical quick-login / seed phone for KB Support (11 digits after +254). */
export const SUPPORT_DESK_PHONE = '+254700000009';

/** Extra user IDs may be added later; phone match is the primary gate. */
export const SUPPORT_DESK_USER_IDS: readonly string[] = [];

export function normalizeSupportPhone(phone?: string | null): string {
  return (phone ?? '').replace(/\s+/g, '').trim();
}

export function isSupportDeskUser(user?: {
  userId?: string | null;
  phoneNumber?: string | null;
  phone_number?: string | null;
} | null): boolean {
  if (!user) return false;
  const phone = normalizeSupportPhone(user.phoneNumber ?? user.phone_number);
  if (phone && phone === SUPPORT_DESK_PHONE) return true;
  const id = user.userId?.trim();
  if (id && SUPPORT_DESK_USER_IDS.includes(id)) return true;
  return false;
}

export const SUPPORT_TICKET_CONTEXT = 'support_ticket' as const;
