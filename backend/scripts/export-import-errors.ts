#!/usr/bin/env npx tsx
/**
 * Export all validation errors for an import session to CSV.
 * Usage:
 *   npx tsx scripts/export-import-errors.ts                    # latest session
 *   npx tsx scripts/export-import-errors.ts <session-uuid>
 */
import fs from 'fs';
import path from 'path';
import { initDatabase, db } from '../src/db/database';
import { getImportValidationErrors, formatImportErrorsCsv } from '../src/services/importService';

initDatabase();

const sessionId =
  process.argv[2] ??
  (
    db.prepare(`
    SELECT id FROM import_sessions
    WHERE status = 'validated'
    ORDER BY rowid DESC LIMIT 1
  `).get() as { id: string } | undefined
  )?.id;

if (!sessionId) {
  console.error('No import session found. Run Validate on a file in the app first.');
  process.exit(1);
}

const errors = getImportValidationErrors(sessionId);
if (errors.length === 0) {
  console.error(`No errors stored for session ${sessionId}`);
  process.exit(1);
}

const out = path.join(process.cwd(), `import-errors-${sessionId.slice(0, 8)}.csv`);
fs.writeFileSync(out, formatImportErrorsCsv(errors), 'utf-8');
console.log(`Wrote ${errors.length} errors to:\n${out}`);
