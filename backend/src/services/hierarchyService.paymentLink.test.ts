import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Pool } from 'pg';

process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';

import { createPendingPaymentForApprovedTask, settleTransferredPayment } from './hierarchyService';

type Call = { text: string; params: unknown[] };
type Handler = (text: string, params: unknown[]) => Record<string, unknown>[] | undefined;

const FARMER_ID = 'farmer-1';
const FARMER_TASK_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_FARMER_TASK_ID = '22222222-2222-2222-2222-222222222222';
const PAYMENT_ID = 'pay-1';

let calls: Call[] = [];
let handler: Handler = () => [];

beforeEach(() => {
  calls = [];
  handler = () => [];
  mock.method(Pool.prototype, 'query', async (text: unknown, params?: unknown) => {
    const sql = String(text);
    const p = (params as unknown[]) ?? [];
    calls.push({ text: sql, params: p });
    return { rows: handler(sql, p) ?? [] };
  });
});

afterEach(() => {
  mock.restoreAll();
});

const inserts = () => calls.filter((c) => /INSERT INTO payments/i.test(c.text));

const approvedTask = {
  id: FARMER_TASK_ID,
  farmer_id: FARMER_ID,
  name: 'Plant maize',
  payment_value_kes: 2500,
};

test('createPendingPaymentForApprovedTask: trigger-created payment exists -> no second insert', async () => {
  handler = (text) => {
    // Trigger row: description = task name, farmer_task_id set (no 'Task:<id>' description).
    if (/FROM payments/i.test(text) && /farmer_task_id/i.test(text)) return [{ id: 'trigger-pay' }];
    return [];
  };

  await createPendingPaymentForApprovedTask(approvedTask);

  assert.equal(inserts().length, 0);
  const lookup = calls.find((c) => /FROM payments/i.test(c.text))!;
  assert.match(lookup.text, /farmer_task_id/);
  assert.match(lookup.text, /description = \$2/);
  assert.deepEqual(lookup.params, [FARMER_TASK_ID, `Task:${FARMER_TASK_ID}`]);
});

test('createPendingPaymentForApprovedTask: legacy Task:<id> payment exists -> no insert', async () => {
  handler = (text) => (/FROM payments/i.test(text) ? [{ id: 'legacy-pay' }] : []);
  await createPendingPaymentForApprovedTask(approvedTask);
  assert.equal(inserts().length, 0);
});

test('createPendingPaymentForApprovedTask: none exists -> exactly one insert with farmer_task_id', async () => {
  await createPendingPaymentForApprovedTask(approvedTask);

  const ins = inserts();
  assert.equal(ins.length, 1);
  assert.match(ins[0].text, /\(id, farmer_id, farmer_task_id, description, amount, payment_status, payment_method\)/);
  assert.match(
    ins[0].text,
    /ON CONFLICT \(farmer_task_id\) WHERE farmer_task_id IS NOT NULL DO NOTHING/
  );
  const [, farmerId, farmerTaskId, description, amount] = ins[0].params;
  assert.equal(farmerId, FARMER_ID);
  assert.equal(farmerTaskId, FARMER_TASK_ID);
  assert.equal(description, `Task:${FARMER_TASK_ID}`);
  assert.equal(amount, 2500);
});

test('createPendingPaymentForApprovedTask: zero amount or missing ids -> no queries', async () => {
  await createPendingPaymentForApprovedTask({ ...approvedTask, payment_value_kes: 0 });
  await createPendingPaymentForApprovedTask({ id: FARMER_TASK_ID });
  await createPendingPaymentForApprovedTask(null);
  assert.equal(calls.length, 0);
});

test('settleTransferredPayment: trigger-style payment completes the linked farmer task and notifies', async () => {
  const completed: Call[] = [];
  const notifications: Call[] = [];

  handler = (text, params) => {
    if (/UPDATE payments SET payment_status = 'transferred'/i.test(text)) {
      return [
        {
          id: PAYMENT_ID,
          farmer_id: FARMER_ID,
          amount: 2500,
          // Trigger payments use the task name as description, not 'Task:<id>'.
          description: 'Plant maize',
          mpesa_reference: 'REF1',
        },
      ];
    }
    if (/SELECT farmer_task_id FROM payments/i.test(text)) {
      assert.deepEqual(params, [PAYMENT_ID]);
      return [{ farmer_task_id: FARMER_TASK_ID }];
    }
    if (/SELECT ft\.id\s+FROM farmer_tasks ft/i.test(text)) {
      assert.deepEqual(params, [FARMER_ID, FARMER_TASK_ID]);
      return [{ id: FARMER_TASK_ID }];
    }
    if (/UPDATE farmer_tasks ft/i.test(text)) {
      completed.push({ text, params });
      return [{ id: FARMER_TASK_ID, name: 'Plant maize', program_project_id: 'proj-1' }];
    }
    if (/FROM users WHERE farmer_id::text = \$1::text/i.test(text)) {
      return [{ user_id: 'farmer-user-1' }];
    }
    if (/SELECT name FROM farmers/i.test(text)) return [{ name: 'Jane Farmer' }];
    if (/INSERT INTO notifications/i.test(text)) {
      notifications.push({ text, params });
      return [];
    }
    return [];
  };

  const ok = await settleTransferredPayment(PAYMENT_ID, 'REF1');
  assert.equal(ok, true);

  // Completed exactly the farmer task referenced by payments.farmer_task_id, for the right farmer.
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0].params, [FARMER_TASK_ID, FARMER_ID]);
  assert.ok(!completed.some((c) => c.params.includes(OTHER_FARMER_TASK_ID)));

  // Farmer notification references the task (by task name, not the trigger's description).
  const farmerNotes = notifications.filter((n) => n.params[1] === 'farmer-user-1');
  assert.equal(farmerNotes.length, 1);
  assert.equal(farmerNotes[0].params[4], 'payment_processed');
  assert.equal(farmerNotes[0].params[5], 'farmer_task');
  assert.equal(farmerNotes[0].params[6], FARMER_TASK_ID);
  assert.match(String(farmerNotes[0].params[3]), /"Plant maize"/);

  // Did not fall back to the amount-based guess.
  assert.ok(!calls.some((c) => /ABS\(COALESCE\(t\.payment_value_kes/i.test(c.text)));
});
