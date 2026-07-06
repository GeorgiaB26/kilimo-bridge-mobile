import fs from 'fs';
import path from 'path';
import { initDatabase } from './db/database';
import { seedDatabase } from './seed';
import { validateCsvImport, executeImport, getImportComplete } from './services/importService';

initDatabase();
seedDatabase();

const csvPath = path.join(__dirname, '..', 'data', 'test-farmers.csv');
const content = fs.readFileSync(csvPath, 'utf-8');

console.log('=== CSV Validation ===');
const validation = validateCsvImport(content);
console.log(`Total: ${validation.totalRows}, Valid: ${validation.validRows}, Invalid: ${validation.invalidRows}, Duplicates: ${validation.duplicates}`);
console.log('Preview:', validation.preview);

if (validation.willImport > 0) {
  console.log('\n=== Starting Import ===');
  executeImport(validation.sessionId, true).then(async (result) => {
    console.log(`Import started: ${result.totalToImport} farmers, ETA ${result.estimatedTimeSeconds}s`);
    await new Promise((r) => setTimeout(r, 8000));
    const complete = getImportComplete(validation.sessionId);
    console.log('Complete:', complete);
    process.exit(0);
  });
} else {
  console.log('No valid rows to import');
  process.exit(0);
}
