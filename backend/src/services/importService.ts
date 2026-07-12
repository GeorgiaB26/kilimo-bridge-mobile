import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import { db } from '../db/database';
import {
  validateFarmerRow,
  csvRowToFarmerInput,
  headersMatchExpected,
  suggestColumnMapping,
  type FarmerInput,
} from '../../../shared/src/validation';
import { getMembershipGroupNames, getExistingIdentifiers, importFarmerFromCsv } from './farmerService';
import type { ImportValidationResponse } from '../../../shared/src/types';

interface ParsedRow {
  rowNumber: number;
  data: FarmerInput;
  raw: Record<string, string>;
}

interface ValidationRowResult {
  rowNumber: number;
  valid: boolean;
  duplicate: boolean;
  errors: Array<{ field: string; value: string; error: string; suggestion?: string }>;
  normalized: Partial<FarmerInput>;
}

const activeImports = new Map<string, { interval?: NodeJS.Timeout; status: string }>();

function applyColumnMapping(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [systemCol, csvCol] of Object.entries(mapping)) {
    mapped[systemCol] = row[csvCol] ?? '';
  }
  return mapped;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase());
    const hasName = cells.some((c) => c === 'name');
    const hasPhoneOrLocation = cells.some((c) =>
      ['phone', 'district', 's/n', 'sn', 'membership group', 'memebrship group', 'names of grpsops'].includes(c)
    );
    if (hasName && hasPhoneOrLocation) return i;
  }
  return 0;
}

function isDataRow(row: Record<string, string>): boolean {
  const input = csvRowToFarmerInput(row);
  const name = input.name?.trim() ?? '';
  return name.length >= 2 && !/^name$/i.test(name);
}

export function parseCsvContent(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
  });

  const matrix = (raw.data as string[][]).filter((row) => row.some((cell) => cell?.trim()));
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerIdx = findHeaderRowIndex(matrix);
  const headers = matrix[headerIdx].map((h) => h.trim());
  const dataRows = matrix.slice(headerIdx + 1);

  const rows = dataRows
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        if (header) obj[header] = (cells[i] ?? '').trim();
      });
      return obj;
    })
    .filter(isDataRow);

  return { headers, rows };
}

export function validateCsvImport(
  content: string,
  columnMapping?: Record<string, string>
): ImportValidationResponse {
  const sessionId = uuidv4();
  const { headers, rows } = parseCsvContent(content);
  const headersMatch = headersMatchExpected(headers);
  const mapping = columnMapping ?? (headersMatch ? undefined : suggestColumnMapping(headers));

  const membershipGroups = getMembershipGroupNames();
  const existing = getExistingIdentifiers();
  const seenPhones = new Set<string>();
  const seenIdNumbers = new Set<string>();
  const seenKeys = new Set<string>();

  const validationResults: ValidationRowResult[] = [];
  const allErrors: ImportValidationResponse['errors'] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const mappedRow = mapping ? applyColumnMapping(rawRow, mapping) : rawRow;
    const farmerInput = csvRowToFarmerInput(mappedRow);

    const result = validateFarmerRow(farmerInput, {
      existingPhones: existing.phones,
      existingIdNumbers: existing.idNumbers,
      existingKeys: existing.keys,
      membershipGroups,
      rowNumber,
      importMode: true,
    });

    let duplicate = false;
    const phone = result.normalized.phone;
    const idNum = result.normalized.idNumber;
    const key = result.normalized.key;

    if (phone && (seenPhones.has(phone) || existing.phones.has(phone))) {
      duplicate = true;
      if (!result.errors.some((e) => e.field === 'phone')) {
        result.errors.push({ field: 'phone', value: farmerInput.phone, error: 'Duplicate phone in file or system' });
      }
    }
    if (idNum && (seenIdNumbers.has(idNum) || existing.idNumbers.has(idNum))) duplicate = true;
    if (key && (seenKeys.has(key) || existing.keys.has(key))) duplicate = true;

    if (phone) seenPhones.add(phone);
    if (idNum) seenIdNumbers.add(idNum);
    if (key) seenKeys.add(key);

    const valid = result.valid && !duplicate;
    validationResults.push({
      rowNumber,
      valid,
      duplicate,
      errors: result.errors,
      normalized: result.normalized,
    });

    for (const err of result.errors) {
      allErrors.push({ row: rowNumber, ...err });
    }
  });

  const validRows = validationResults.filter((r) => r.valid).length;
  const invalidRows = validationResults.filter((r) => !r.valid && !r.duplicate).length;
  const duplicates = validationResults.filter((r) => r.duplicate).length;

  const countryBreakdown: Record<string, number> = {};
  const errorsByCountry: Record<string, number> = {};

  validationResults.forEach((r, i) => {
    const mappedRow = mapping ? applyColumnMapping(rows[i], mapping) : rows[i];
    const country = (r.normalized.country ?? mappedRow['Country'] ?? 'Kenya').trim();
    if (r.valid) {
      countryBreakdown[country] = (countryBreakdown[country] ?? 0) + 1;
    } else if (!r.duplicate) {
      errorsByCountry[country] = (errorsByCountry[country] ?? 0) + 1;
    }
  });

  const detectedCountry =
    Object.entries(countryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const fixedPreview = validationResults.slice(0, 10).map((r, i) => {
    const mappedRow = mapping ? applyColumnMapping(rows[i], mapping) : rows[i];
    const input = csvRowToFarmerInput(mappedRow);
    return {
      name: r.normalized.name ?? input.name,
      phone: r.normalized.phone ?? input.phone,
      district: r.normalized.district ?? input.district,
      membershipGroup: r.normalized.membershipGroup ?? input.membershipGroup,
      country: r.normalized.country ?? input.country,
      status: (r.duplicate ? 'duplicate' : r.valid ? 'valid' : 'invalid') as 'valid' | 'invalid' | 'duplicate',
    };
  });

  db.prepare(`
    INSERT INTO import_sessions (id, status, total_rows, valid_rows, invalid_rows, duplicates, data, errors)
    VALUES (?, 'validated', ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    rows.length,
    validRows,
    invalidRows,
    duplicates,
    JSON.stringify(validationResults),
    JSON.stringify(allErrors)
  );

  return {
    status: 'validation_complete',
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicates,
    willImport: validRows,
    errors: allErrors.slice(0, 100),
    preview: fixedPreview,
    headersMatch,
    columnMapping: mapping,
    sessionId,
    countryBreakdown,
    errorsByCountry,
    detectedCountry,
  };
}

export async function executeImport(
  sessionId: string,
  skipDuplicates = true,
  registeredBy?: string
): Promise<{ importId: string; totalToImport: number; estimatedTimeSeconds: number }> {
  const session = db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(sessionId) as {
    id: string;
    data: string;
    valid_rows: number;
  } | undefined;

  if (!session) throw new Error('Import session not found');

  const importId = uuidv4();
  const validationResults: ValidationRowResult[] = JSON.parse(session.data);
  const toImport = validationResults.filter((r) => r.valid && (!skipDuplicates || !r.duplicate));

  db.prepare('UPDATE import_sessions SET status = ? WHERE id = ?').run('importing', sessionId);

  const estimatedTimeSeconds = Math.ceil(toImport.length / 50);

  // Run import asynchronously
  setTimeout(() => runImport(importId, sessionId, toImport, registeredBy), 100);

  return {
    importId,
    totalToImport: toImport.length,
    estimatedTimeSeconds,
  };
}

function runImport(
  importId: string,
  sessionId: string,
  rows: ValidationRowResult[],
  registeredBy?: string
): void {
  let imported = 0;
  const total = rows.length;
  const importErrors: Array<{ row: number; field: string; value: string; error: string }> = [];

  const batchSize = Math.max(1, Math.floor(total / 10));

  const interval = setInterval(() => {
    const end = Math.min(imported + batchSize, total);
    for (let i = imported; i < end; i++) {
      const row = rows[i];
      try {
        const data = row.normalized as FarmerInput & { key: string; phone: string };
        importFarmerFromCsv(data, registeredBy);
      } catch (err) {
        importErrors.push({
          row: row.rowNumber,
          field: 'general',
          value: '',
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
    imported = end;

    db.prepare('UPDATE import_sessions SET imported_count = ? WHERE id = ?').run(imported, sessionId);

    if (imported >= total) {
      clearInterval(interval);
      db.prepare(`
        UPDATE import_sessions SET status = 'complete', completed_at = datetime('now'), errors = ?
        WHERE id = ?
      `).run(JSON.stringify(importErrors), sessionId);
      activeImports.set(importId, { status: 'complete' });
    }
  }, 500);

  activeImports.set(importId, { interval, status: 'in_progress' });
}

export function getImportProgress(importId: string, sessionId: string) {
  const session = db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(sessionId) as {
    imported_count: number;
    valid_rows: number;
    status: string;
    errors: string;
  } | undefined;

  if (!session) return null;

  const total = session.valid_rows;
  const imported = session.imported_count;
  const percent = total > 0 ? Math.round((imported / total) * 100) : 100;
  const status = session.status === 'complete' ? 'complete' : 'in_progress';

  return {
    importId,
    importedCount: imported,
    totalCount: total,
    percentComplete: percent,
    status,
  };
}

export function getImportComplete(sessionId: string) {
  const session = db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(sessionId) as {
    id: string;
    imported_count: number;
    duplicates: number;
    errors: string;
    completed_at: string;
    status: string;
  } | undefined;

  if (!session || session.status !== 'complete') return null;

  const errors = JSON.parse(session.errors || '[]');
  return {
    status: 'import_complete' as const,
    importId: session.id,
    importedCount: session.imported_count,
    duplicatesSkipped: session.duplicates,
    errorsCount: errors.length,
    timestamp: session.completed_at,
    errors,
  };
}
