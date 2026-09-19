/**
 * Equity SFTP batch schema (idempotent).
 * Applied by scripts/apply-equity-batches-migration.ts or at service boot if desired.
 */
import fs from 'fs';
import path from 'path';
import { query } from '../db/database';

const MIGRATION_FILE = path.resolve(__dirname, '../../migrations/018_equity_sftp_batches.sql');

/**
 * Split a SQL migration file on semicolons that end statements, ignoring those
 * inside dollar-quoted DO blocks ($$ … $$).
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) return '';
      return line;
    })
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let inDollar = false;

  for (let i = 0; i < withoutLineComments.length; i++) {
    const ch = withoutLineComments[i];
    const next = withoutLineComments[i + 1];

    if (!inDollar && ch === '$' && next === '$') {
      inDollar = true;
      current += '$$';
      i++;
      continue;
    }
    if (inDollar && ch === '$' && next === '$') {
      inDollar = false;
      current += '$$';
      i++;
      continue;
    }

    if (!inDollar && ch === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

const RLS_MIGRATION_FILE = path.resolve(__dirname, '../../migrations/019_equity_batches_rls.sql');

export async function ensureEquityBatchTables(): Promise<void> {
  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Missing migration file: ${MIGRATION_FILE}`);
  }
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await query(statement);
  }
  await ensureEquityBatchRls();
}

/** Enable RLS + banking/platform policies (idempotent). */
export async function ensureEquityBatchRls(): Promise<void> {
  if (!fs.existsSync(RLS_MIGRATION_FILE)) {
    throw new Error(`Missing migration file: ${RLS_MIGRATION_FILE}`);
  }
  const sql = fs.readFileSync(RLS_MIGRATION_FILE, 'utf8');
  for (const statement of splitSqlStatements(sql)) {
    await query(statement);
  }
}
