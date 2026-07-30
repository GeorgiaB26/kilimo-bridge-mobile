/**
 * Export SQLite schema + row counts for migration planning.
 * Usage: cd backend && npx tsx scripts/export-schema.ts
 */
import fs from 'fs';
import path from 'path';
import { initDatabase, getDatabasePath, db } from '../src/db/database';

initDatabase();

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  .all() as { name: string }[];

const schema = db
  .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all() as { sql: string }[];

const counts: Record<string, number> = {};
for (const { name } of tables) {
  const row = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
  counts[name] = row.c;
}

const outDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const report = {
  dbPath: getDatabasePath(),
  exportedAt: new Date().toISOString(),
  tableCount: tables.length,
  rowCounts: counts,
  schema: schema.map((s) => s.sql).join('\n\n'),
};

const jsonPath = path.join(outDir, 'schema-export.json');
const sqlPath = path.join(outDir, 'schema-export.sql');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(sqlPath, report.schema);

console.log(`Exported ${tables.length} tables to ${jsonPath}`);
console.log('Row counts:', counts);
