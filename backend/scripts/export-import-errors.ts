#!/usr/bin/env npx tsx
/**
 * Export all validation errors for an import session to CSV.
 * Usage:
 *   npx tsx scripts/export-import-errors.ts                    # latest session
 *   npx tsx scripts/export-import-errors.ts <session-uuid>
 */
import fs from 'fs';
import path from 'path';
import { initDatabase, queryOne } from '../src/db/database';
import { getImportValidationErrors, formatImportErrorsCsv } from '../src/services/importService';

initDatabase();

async function main(): Promise<void> {
  const sessionId =
    process.argv[2] ??
    (
      await queryOne<{ id: string }>(`
        SELECT id FROM import_sessions
        WHERE status = 'validated'
        ORDER BY created_at DESC LIMIT 1
      `)
    )?.id;

  if (!sessionId) {
    console.error('No import session found. Run Validate on a file in the app first.');
    process.exit(1);
  }

  const errors = await getImportValidationErrors(sessionId);
  if (errors.length === 0) {
    console.error(`No errors stored for session ${sessionId}`);
    process.exit(1);
  }

  const out = path.join(process.cwd(), `import-errors-${sessionId.slice(0, 8)}.csv`);
  fs.writeFileSync(out, formatImportErrorsCsv(errors), 'utf-8');
  console.log(`Wrote ${errors.length} errors to:\n${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
