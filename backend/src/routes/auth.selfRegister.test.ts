/**
 * POST /api/auth/self-register lockdown + "pending_approval users can never log in".
 *
 * Runs the real auth router (route + selfRegistrationService + authService) behind a real express
 * server on an ephemeral port. The database is never touched: pg's Pool.prototype.query is replaced
 * with a tiny in-memory fake of just the tables these flows use, and DATABASE_URL points nowhere.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'self-register-test-secret-not-for-production-use-0123456789';
process.env.ENCRYPTION_KEY = 'self-register-test-encryption-key-0123456789abcdef';

type UserRow = {
  user_id: string;
  phone_number: string;
  name: string;
  role: string;
  farmer_id: string | null;
  district: string | null;
  region: string | null;
  aggregation_center: string | null;
  status: string;
  password_hash: string | null;
};
type AuditRow = { action: string; success: boolean; details: Record<string, unknown> | null; ip: string | null };

let users: UserRow[] = [];
let agents: unknown[][] = [];
let audits: AuditRow[] = [];
let otps: Array<{ phone: string; code: string; expires_at: string; id: string; used: boolean }> = [];
let queries: string[] = [];
let server: Server;
let baseUrl: string;
const savedEnv = { NODE_ENV: process.env.NODE_ENV, PILOT_OTP: process.env.PILOT_OTP };

function restoreEnv(): void {
  for (const key of ['NODE_ENV', 'PILOT_OTP'] as const) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

function fakeQuery(text: string, params: unknown[]): Record<string, unknown>[] {
  queries.push(text);

  if (/INSERT INTO users/.test(text)) {
    const p = params;
    const withStatusLast = /password_hash,\s*status\s*\)/.test(text); // userService.createUser(status)
    const staffInsert = /region, status, password_hash/.test(text); // project_manager insert
    users.push({
      user_id: String(p[0]),
      phone_number: String(p[1]),
      name: String(p[2]),
      role: String(p[3]),
      farmer_id: staffInsert ? null : ((p[4] as string | null) ?? null),
      district: (staffInsert ? p[4] : p[5]) as string | null,
      region: (staffInsert ? p[5] : p[6]) as string | null,
      aggregation_center: staffInsert ? null : ((p[7] as string | null) ?? null),
      status: staffInsert ? String(p[6]) : withStatusLast ? String(p[9]) : 'active', // 'active' = column default
      password_hash: (staffInsert ? p[7] : p[8]) as string | null,
    });
    return [];
  }
  if (/INSERT INTO agents/.test(text)) {
    agents.push(params);
    return [];
  }
  if (/INSERT INTO audit_logs/.test(text)) {
    audits.push({
      action: String(params[3]),
      success: params[9] === true,
      details: params[7] ? (JSON.parse(String(params[7])) as Record<string, unknown>) : null,
      ip: (params[8] as string | null) ?? null,
    });
    return [];
  }
  if (/FROM agents WHERE government_id_encrypted/.test(text)) return [];

  const byPhone = /FROM users WHERE phone_number = \$1( AND status = \$2)?/.exec(text);
  if (byPhone) {
    return users
      .filter((u) => u.phone_number === params[0] && (!byPhone[1] || u.status === params[1]))
      .map((u) => ({ ...u }));
  }
  if (/FROM users WHERE user_id = \$1 AND status = \$2/.test(text)) {
    return users.filter((u) => u.user_id === params[0] && u.status === params[1]).map((u) => ({ ...u }));
  }

  if (/DELETE FROM otp_codes/.test(text)) {
    otps = otps.filter((o) => o.phone !== params[0]);
    return [];
  }
  if (/INSERT INTO otp_codes/.test(text)) {
    otps.push({ id: String(params[0]), phone: String(params[1]), code: String(params[2]), expires_at: String(params[3]), used: false });
    return [];
  }
  if (/FROM otp_codes/.test(text)) {
    return otps.filter((o) => o.phone === params[0] && !o.used).map((o) => ({ ...o }));
  }
  if (/UPDATE otp_codes SET used = true/.test(text)) {
    for (const o of otps) if (o.id === params[0]) o.used = true;
    return [];
  }
  throw new Error(`Unexpected query in self-register test: ${text.slice(0, 80)}`);
}

before(async () => {
  const { default: authRoutes } = await import('./auth');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  users = [];
  agents = [];
  audits = [];
  otps = [];
  queries = [];
  restoreEnv();
  mock.method(Pool.prototype, 'query', async (text: unknown, params?: unknown) => ({
    rows: fakeQuery(String(text), (params as unknown[]) ?? []),
  }));
});

afterEach(() => {
  mock.restoreAll();
  restoreEnv();
});

async function post(path: string, body: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const AGENT_BODY = {
  userType: 'field_agent',
  name: 'Pending Agent',
  phone: '+254700000111',
  governmentId: 'ID-12345678',
  aggregationCenter: 'Centre A',
  region: 'Central',
  district: 'Kiambu',
};
const PM_BODY = {
  userType: 'project_manager',
  name: 'Pending PM',
  phone: '+254700000222',
  email: 'pm@example.test',
  password: 'correct-horse-battery',
  region: 'Central',
  district: 'Kiambu',
};

const PRIVILEGED = ['admin', 'super_admin', 'platform_admin', 'banking_agent', 'banking_admin'];

test('privileged userTypes get 403 and create no account, no agent row and no "created" audit entry', async () => {
  for (const userType of [...PRIVILEGED, 'agent', 'Admin', ' SUPER_ADMIN ']) {
    const res = await post('/self-register', {
      userType,
      name: 'Mallory',
      phone: '+254700000999',
      password: 'secret-password-1',
      governmentId: 'ID-99999999',
      aggregationCenter: 'Centre A',
      region: 'Central',
      district: 'Kiambu',
    });
    assert.equal(res.status, 403, `userType ${userType}`);
  }
  assert.equal(users.length, 0, 'no users row created');
  assert.equal(agents.length, 0, 'no agents row created');
  assert.equal(queries.filter((q) => /INSERT INTO users|INSERT INTO agents/.test(q)).length, 0);
  assert.equal(
    audits.filter((a) => a.action === 'user.create' || a.action === 'agent.register').length,
    0,
    'no audit entry saying an account was created'
  );
  // The refused attempts are recorded as denials only, without personal data.
  assert.ok(audits.length > 0);
  for (const a of audits) {
    assert.equal(a.action, 'permission.denied');
    assert.equal(a.success, false);
    assert.ok(!JSON.stringify(a.details).includes('Mallory'));
    assert.ok(!JSON.stringify(a.details).includes('+254700000999'));
  }
});

test('privileged rejection happens before any database lookup of users', async () => {
  const res = await post('/self-register', { userType: 'admin', name: 'X', phone: '+254700000999', password: 'secret-password-1' });
  assert.equal(res.status, 403);
  assert.equal(queries.filter((q) => /FROM users/.test(q)).length, 0);
});

test('missing or non-string userType is a 400, unknown string types create nothing', async () => {
  assert.equal((await post('/self-register', { name: 'X', phone: '+254700000999' })).status, 400);
  assert.equal((await post('/self-register', { userType: { $ne: 1 }, name: 'X', phone: '+254700000999' })).status, 400);
  assert.equal((await post('/self-register', { userType: 'banana', name: 'X', phone: '+254700000999' })).status, 400);
  assert.equal(users.length, 0);
});

test('field_agent is created as pending_approval, never active, with the audit trail', async () => {
  const res = await post('/self-register', AGENT_BODY);
  assert.equal(res.status, 201);
  assert.equal(res.json.pendingApproval, true);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'agent');
  assert.equal(users[0].status, 'pending_approval');

  const created = audits.find((a) => a.details?.self_registration === true);
  assert.ok(created, 'audit entry with self_registration true');
  assert.equal(created.action, 'agent.register');
  assert.equal(created.details?.user_type, 'field_agent');
  assert.equal(created.details?.status, 'pending_approval');
});

test('project_manager is created as pending_approval, never active, with the audit trail', async () => {
  const res = await post('/self-register', PM_BODY);
  assert.equal(res.status, 201);
  assert.equal(res.json.pendingApproval, true);
  assert.equal(users.length, 1);
  assert.equal(users[0].status, 'pending_approval');

  const created = audits.find((a) => a.details?.self_registration === true);
  assert.ok(created, 'audit entry with self_registration true');
  assert.equal(created.action, 'user.create');
  assert.equal(created.details?.user_type, 'project_manager');
  assert.equal(created.details?.status, 'pending_approval');
});

test('farmer behaviour is unchanged: 201, nothing created by this call', async () => {
  const res = await post('/self-register', { userType: 'farmer', name: 'Wanjiru', phone: '+254700000333' });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  assert.equal(
    res.json.message,
    'Continue with the farmer registration form to complete your profile.'
  );
  assert.equal(res.json.pendingApproval, undefined);
  assert.equal(users.length, 0);
  assert.equal(audits.length, 0);
});

test('an already registered phone still cannot be re-registered as staff', async () => {
  assert.equal((await post('/self-register', AGENT_BODY)).status, 201);
  const again = await post('/self-register', { ...PM_BODY, phone: AGENT_BODY.phone });
  assert.equal(again.status, 400);
  assert.equal(users.length, 1);
});

test('pending_approval users are refused at every login path; the same flow works once active', async () => {
  assert.equal((await post('/self-register', AGENT_BODY)).status, 201);
  assert.equal((await post('/self-register', PM_BODY)).status, 201);
  assert.ok(users.every((u) => u.status === 'pending_approval'));

  // A code issued earlier (for example while the account was active) must not work either.
  const future = new Date(Date.now() + 60_000).toISOString();
  for (const u of users) otps.push({ id: `otp-${u.user_id}`, phone: u.phone_number, code: '123456', expires_at: future, used: false });

  const attemptAll = async (label: string) => {
    for (const u of users) {
      const phone = u.phone_number;
      const tag = `${label} ${phone}`;
      const otpRequest = await post('/request-otp', { phone });
      assert.equal(otpRequest.status, 400, `request-otp ${tag}`);
      assert.equal(otpRequest.json.devCode, undefined, `no dev code leaked ${tag}`);

      const verify = await post('/verify-otp', { phone, code: '123456' });
      assert.equal(verify.status, 401, `verify-otp ${tag}`);
      assert.equal(verify.json.token, undefined);

      const password = await post('/login', { phone, password: PM_BODY.password });
      assert.equal(password.status, 401, `login ${tag}`);
      assert.equal(password.json.token, undefined);

      const devLogin = await post('/dev-login', { phone });
      assert.equal(devLogin.status, 401, `dev-login ${tag}`);
      assert.equal(devLogin.json.token, undefined);

      const devToken = await post('/dev-token', { phone });
      assert.equal(devToken.status, 401, `dev-token ${tag}`);
      assert.equal(devToken.json.token, undefined);

      // A token minted for the pending user (e.g. issued before it was blocked) is rejected too.
      const stale = jwt.sign({ userId: u.user_id }, process.env.JWT_SECRET as string, { expiresIn: '5m' });
      const protectedCall = await post('/logout', {}, stale);
      assert.equal(protectedCall.status, 401, `existing token ${tag}`);
    }
  };

  await attemptAll('dev env');

  // Pilot mode in production turns dev-login/dev-token on; pending users must still be refused.
  process.env.NODE_ENV = 'production';
  process.env.PILOT_OTP = 'true';
  await attemptAll('pilot prod');

  // Control: the same requests succeed once the status is active, so the checks above can fail.
  restoreEnv();
  for (const u of users) u.status = 'active';
  const pm = users.find((u) => u.role === 'admin');
  const agent = users.find((u) => u.role === 'agent');
  assert.ok(pm && agent);
  const okPassword = await post('/login', { phone: pm.phone_number, password: PM_BODY.password });
  assert.equal(okPassword.status, 200);
  assert.ok(okPassword.json.token);
  const okDev = await post('/dev-login', { phone: agent.phone_number });
  assert.equal(okDev.status, 200);
  assert.equal((await post('/request-otp', { phone: agent.phone_number })).status, 200);
  const okOtp = await post('/verify-otp', { phone: agent.phone_number, code: '123456' });
  assert.equal(okOtp.status, 200);
  const okToken = await post('/logout', {}, jwt.sign({ userId: pm.user_id }, process.env.JWT_SECRET as string));
  assert.equal(okToken.status, 200);
});
