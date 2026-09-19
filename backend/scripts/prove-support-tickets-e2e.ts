/**
 * End-to-end smoke for support tickets (Piece A–G).
 * Run from backend/: npx tsx scripts/prove-support-tickets-e2e.ts
 *
 * Flow: farmer creates ticket → desk stats/inbox → reply → resolve →
 * farmer thread is resolved (read-only) + resolve notification exists.
 */
import { closeDatabase } from '../src/db/database';
import { ensureMessagingTables } from '../src/services/messagingService';
import { ensureSupportTicketTables } from '../src/services/supportTicketService';
import { ensureDemoFarmerPortal } from '../src/ensureDemoFarmerPortal';
import { createSupportTicket, listSupportTicketsForUser, getSupportTicketStats, replyToSupportTicket, resolveSupportTicket, getSupportTicketMessages } from '../src/services/supportTicketService';
import { getThreadMessages } from '../src/services/messagingService';
import { query, queryOne } from '../src/db/database';
import { SUPPORT_DESK_PHONE } from '../../shared/src/supportDesk';

const FARMER_PHONE = '+254712345678';

async function main(): Promise<void> {
  console.log('1) Ensure schema + demo/support users…');
  await ensureMessagingTables();
  await ensureSupportTicketTables();
  await ensureDemoFarmerPortal();

  const farmer = await queryOne<{ user_id: string; role: string; phone_number: string }>(
    `SELECT user_id::text AS user_id, role::text AS role, phone_number FROM users WHERE phone_number = $1`,
    [FARMER_PHONE]
  );
  const desk = await queryOne<{ user_id: string; role: string; phone_number: string }>(
    `SELECT user_id::text AS user_id, role::text AS role, phone_number FROM users WHERE phone_number = $1`,
    [SUPPORT_DESK_PHONE]
  );
  if (!farmer || !desk) {
    throw new Error(`Missing users farmer=${!!farmer} desk=${!!desk}`);
  }
  console.log('   farmer', farmer.user_id.slice(0, 8), 'desk', desk.user_id.slice(0, 8));

  const subject = `E2E Support ${Date.now()}`;
  console.log('2) Farmer creates ticket…');
  const created = await createSupportTicket({
    userId: farmer.user_id,
    role: farmer.role,
    phoneNumber: farmer.phone_number,
    subject,
    description: 'Cannot see my expected payment. Please help. (e2e)',
  });
  const threadId = created.threadId;
  console.log('   threadId', threadId);

  console.log('3) Desk sees open ticket in stats + list…');
  const stats = await getSupportTicketStats({
    userId: desk.user_id,
    phoneNumber: desk.phone_number,
    role: desk.role,
  });
  console.log('   stats', stats);
  if (stats.open < 1) throw new Error('Expected open >= 1');

  const openList = await listSupportTicketsForUser(desk.user_id, {
    userId: desk.user_id,
    phoneNumber: desk.phone_number,
    role: desk.role,
    status: 'open',
  });
  if (!openList.some((t) => t.thread_id === threadId)) {
    throw new Error('Created ticket missing from desk open list');
  }

  console.log('4) Desk replies…');
  await replyToSupportTicket({
    threadId,
    userId: desk.user_id,
    role: desk.role,
    phoneNumber: desk.phone_number,
    content: 'Thanks — we are looking into your payment. (e2e)',
  });

  console.log('5) Desk resolves…');
  const resolved = await resolveSupportTicket({
    threadId,
    userId: desk.user_id,
    role: desk.role,
    phoneNumber: desk.phone_number,
  });
  if (resolved.status !== 'resolved') throw new Error('Expected resolved status');

  console.log('6) Farmer thread is resolved (read-only for non-desk)…');
  const farmerView = await getThreadMessages(threadId, farmer.user_id);
  if (farmerView.support_status !== 'resolved') {
    throw new Error(`Expected support_status=resolved got ${farmerView.support_status}`);
  }
  if (farmerView.context_type !== 'support_ticket') {
    throw new Error(`Expected context_type=support_ticket got ${farmerView.context_type}`);
  }

  let blocked = false;
  try {
    const { sendThreadMessage } = await import('../src/services/messagingService');
    await sendThreadMessage(threadId, farmer.user_id, 'should fail');
  } catch (err) {
    blocked = err instanceof Error && err.message.toLowerCase().includes('resolved');
    console.log('   farmer reply blocked:', err instanceof Error ? err.message : err);
  }
  if (!blocked) throw new Error('Farmer should not be able to reply on resolved ticket');

  console.log('7) Resolve notification for farmer…');
  const notif = await queryOne<{ type: string; action_url: string | null; context_id: string | null }>(
    `SELECT type, action_url, context_id::text AS context_id
     FROM notifications
     WHERE user_id::text = $1::text AND type = 'support_ticket_resolved'
     ORDER BY created_at DESC LIMIT 1`,
    [farmer.user_id]
  );
  console.log('   notification', notif);
  if (!notif?.action_url?.includes(threadId)) {
    throw new Error('Missing resolve notification action_url deep-link');
  }

  const detail = await getSupportTicketMessages(threadId, farmer.user_id, {
    userId: farmer.user_id,
    phoneNumber: farmer.phone_number,
    role: farmer.role,
  });
  console.log('   farmer can_reply', detail.can_reply, '(expected false when resolved)');
  if (detail.can_reply) throw new Error('Farmer can_reply should be false on resolved ticket');

  // Cleanup e2e thread
  await query(`DELETE FROM message_threads WHERE id = $1`, [threadId]);
  console.log('DONE — support ticket e2e passed; cleaned up thread', threadId);
}

main()
  .then(() => closeDatabase())
  .catch(async (err) => {
    console.error('E2E FAILED:', err instanceof Error ? err.message : err);
    await closeDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
