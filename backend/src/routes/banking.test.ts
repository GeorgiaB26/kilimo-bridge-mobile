/**
 * /api/banking role gate. Runs the real banking router + authenticate middleware behind a real
 * express server on an ephemeral port. The database is never touched: pg's Pool.prototype.query is
 * stubbed (same pattern as hierarchyService.paymentLink.test.ts) and DATABASE_URL points nowhere.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'banking-route-test-secret-not-for-production-use-0123456789';
process.env.ID_NUMBER_HMAC_KEY = 'banking-route-test-hmac-key-0123456789abcdef';

type Call = { text: string; params: unknown[] };

const USERS: Record<string, { role: string; farmer_id?: string | null }> = {
  'u-farmer': { role: 'farmer', farmer_id: 'f-1' },
  'u-agent': { role: 'agent' },
  'u-banking-agent': { role: 'banking_agent' },
  'u-banking-admin': { role: 'banking_admin' },
  'u-admin': { role: 'admin' },
  'u-super-admin': { role: 'super_admin' },
  'u-platform-admin': { role: 'platform_admin' },
};

let calls: Call[] = [];
let server: Server;
let baseUrl: string;

function rowsFor(text: string, params: unknown[]): Record<string, unknown>[] {
  if (/FROM users WHERE user_id = \$1/.test(text)) {
    const user = USERS[String(params[0])];
    if (!user) return [];
    return [
      {
        user_id: String(params[0]),
        phone_number: '+254700000000',
        name: 'Test User',
        role: user.role,
        farmer_id: user.farmer_id ?? null,
        district: null,
        region: null,
        aggregation_center: null,
      },
    ];
  }
  if (/FROM bank_transactions/.test(text)) return [{ id: 'tx-1' }];
  if (/FROM payments p/.test(text)) return [{ id: 'pay-1', farmer_name: 'Someone' }];
  if (/FROM users\s+ORDER BY/i.test(text) || /FROM users\s+WHERE/i.test(text)) return [];
  return [];
}

before(async () => {
  const { default: bankingRoutes } = await import('./banking');
  const app = express();
  app.use(express.json());
  app.use('/api/banking', bankingRoutes);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  calls = [];
  mock.method(Pool.prototype, 'query', async (text: unknown, params?: unknown) => {
    const sql = String(text);
    const p = (params as unknown[]) ?? [];
    calls.push({ text: sql, params: p });
    return { rows: rowsFor(sql, p) };
  });
});

afterEach(() => {
  mock.restoreAll();
});

function tokenFor(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn: '5m' });
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  userId?: string,
  body?: unknown
): Promise<number> {
  const res = await fetch(`${baseUrl}/api/banking${path}`, {
    method,
    headers: {
      ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  await res.arrayBuffer();
  return res.status;
}

function touchedBankData(): boolean {
  return calls.some((c) => /bank_transactions|FROM payments p|id_number_hash/.test(c.text));
}

const READ_ROUTES: Array<['GET' | 'POST', string, unknown?]> = [
  ['GET', '/transactions'],
  ['GET', '/payments'],
  ['POST', '/verify-farmer-id', { id_number: '12345678' }],
];

const ALL_ROUTES: Array<['GET' | 'POST', string, unknown?]> = [
  ...READ_ROUTES,
  ['GET', '/audit'],
  ['GET', '/users'],
  ['POST', '/users', { phoneNumber: '+254700000009', name: 'X' }],
];

test('unauthenticated requests get 401', async () => {
  for (const [method, path, body] of READ_ROUTES) {
    assert.equal(await call(method, path, undefined, body), 401, `${method} ${path}`);
  }
});

test('farmer token gets 403 on every banking route and no bank data is queried', async () => {
  for (const [method, path, body] of ALL_ROUTES) {
    assert.equal(await call(method, path, 'u-farmer', body), 403, `${method} ${path}`);
  }
  assert.equal(touchedBankData(), false);
});

test('agent token gets 403 on every banking route and no bank data is queried', async () => {
  for (const [method, path, body] of ALL_ROUTES) {
    assert.equal(await call(method, path, 'u-agent', body), 403, `${method} ${path}`);
  }
  assert.equal(touchedBankData(), false);
});

test('banking_agent still gets 200 on transactions, payments and verify-farmer-id', async () => {
  for (const [method, path, body] of READ_ROUTES) {
    assert.equal(await call(method, path, 'u-banking-agent', body), 200, `${method} ${path}`);
  }
});

test('banking_admin still gets 200 on transactions, payments and verify-farmer-id', async () => {
  for (const [method, path, body] of READ_ROUTES) {
    assert.equal(await call(method, path, 'u-banking-admin', body), 200, `${method} ${path}`);
  }
});

test('banking_admin can still list banking agents', async () => {
  assert.equal(await call('GET', '/users', 'u-banking-admin'), 200);
});

test('platform_admin still gets 200 on transactions, payments and verify-farmer-id', async () => {
  for (const [method, path, body] of READ_ROUTES) {
    assert.equal(await call(method, path, 'u-platform-admin', body), 200, `${method} ${path}`);
  }
});

test('admin and super_admin pass the role gate but still lack payments.read (no new access)', async () => {
  for (const userId of ['u-admin', 'u-super-admin']) {
    for (const [method, path, body] of READ_ROUTES) {
      assert.equal(await call(method, path, userId, body), 403, `${userId} ${method} ${path}`);
    }
  }
  assert.equal(touchedBankData(), false);
});
