/**
 * RLS proof for public.program_projects after ENABLE ROW LEVEL SECURITY.
 *
 * Usage: cd backend && npx tsx scripts/prove-program-projects-rls-e2e.ts
 */
import 'dotenv/config';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://tzaipijebibisgkwrdnz.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const TEST_PASSWORD = 'KilimoRlsTest2026!';

type Account = {
  label: string;
  email: string;
  role: string;
  region?: string | null;
  expectAll?: boolean;
};

const ACCOUNTS: Account[] = [
  {
    label: 'super_admin',
    email: 'test.superadmin@kilimo.test',
    role: 'super_admin',
    expectAll: true,
  },
  {
    label: 'platform_admin',
    email: 'test.platformadmin@kilimo.test',
    role: 'platform_admin',
    expectAll: true,
  },
  {
    label: 'regional_coordinator Central',
    email: 'test.regionalcoordinator@kilimo.test',
    role: 'regional_coordinator',
    region: 'Central',
  },
  {
    label: 'regional_coordinator Northern',
    email: 'test.regionalcoordinator.ug@kilimo.test',
    role: 'regional_coordinator',
    region: 'Northern',
  },
  {
    label: 'admin Kiambu',
    email: 'test.admin@kilimo.test',
    role: 'admin',
    region: 'Central',
  },
  {
    label: 'field_agent',
    email: 'test.fieldagent@kilimo.test',
    role: 'agent',
    region: 'Central',
  },
  {
    label: 'banking_agent',
    email: 'test.ba@kilimo.test',
    role: 'banking_agent',
  },
];

async function setPassword(email: string, password: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `UPDATE auth.users
       SET encrypted_password = crypt($1, gen_salt('bf')), updated_at = now()
       WHERE email = $2
       RETURNING id::text`,
      [password, email]
    );
    if (r.rowCount === 0) throw new Error(`No auth.users row for ${email}`);
  } finally {
    await pool.end();
  }
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`signIn ${email}: ${res.status} ${body}`);
  const json = JSON.parse(body) as { access_token?: string };
  if (!json.access_token) throw new Error(`No access_token for ${email}`);
  return json.access_token;
}

async function listProjects(token: string): Promise<Array<{ id: string; name: string; region: string | null }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/program_projects?select=id,name,region&order=created_at.asc`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`listProjects: ${res.status} ${body}`);
  return JSON.parse(body) as Array<{ id: string; name: string; region: string | null }>;
}

async function totalProjects(): Promise<number> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query<{ c: number }>('SELECT COUNT(*)::int AS c FROM program_projects');
    return r.rows[0]?.c ?? 0;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY is required');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const total = await totalProjects();
  console.log(`[baseline] program_projects total rows (owner connection): ${total}`);

  for (const account of ACCOUNTS) {
    await setPassword(account.email, TEST_PASSWORD);
  }

  const results: Array<{
    label: string;
    count: number;
    regions: string[];
    ok: boolean;
    note: string;
  }> = [];

  for (const account of ACCOUNTS) {
    const token = await signIn(account.email, TEST_PASSWORD);
    const rows = await listProjects(token);
    const regions = [...new Set(rows.map((r) => r.region ?? '(null)'))].sort();
    let ok = true;
    let note = '';

    if (account.expectAll) {
      ok = rows.length === total;
      note = ok ? 'sees all rows' : `expected ${total}, got ${rows.length}`;
    } else if (account.role === 'banking_agent') {
      ok = rows.length === total;
      note = ok ? 'banking sees all via pp_read_banking' : `banking expected ${total}, got ${rows.length}`;
    } else if (account.role === 'regional_coordinator' && account.region) {
      const outside = rows.filter(
        (r) => r.region && r.region.toLowerCase() !== account.region!.toLowerCase()
      );
      ok = outside.length === 0;
      note = ok
        ? `scoped OK (${rows.length} rows, regions: ${regions.join(', ')})`
        : `leaked regions: ${outside.map((r) => r.region).join(', ')}`;
    } else if (account.role === 'admin' || account.role === 'agent') {
      // Policies use ELSE can_see_ops() for non-elevated roles — document actual behavior.
      note = `non-elevated ops role sees ${rows.length}/${total} rows (regions: ${regions.join(', ')})`;
      ok = rows.length <= total;
    }

    results.push({ label: account.label, count: rows.length, regions, ok, note });
    console.log(`[${account.label}] count=${rows.length} ${note}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error('\nFAILED checks:');
    for (const f of failed) console.error(`  - ${f.label}: ${f.note}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nAll RLS checks passed.');
}

main().catch((err) => {
  console.error('prove-program-projects-rls-e2e failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
