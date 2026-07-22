import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { parseSpreadsheetContent } from './spreadsheetParser';
import {
  validateFarmerRow,
  csvRowToFarmerInput,
  headersMatchExpected,
  suggestColumnMapping,
  applyColumnMapping,
  preprocessImportRow,
  PHONE_HEADER_PATTERN,
  rowHasPhoneValue,
  inferCooperativeNameFromFileName,
  type FarmerInput,
} from '../../../shared/src/validation';

function inferCountryFromDistrict(district?: string, country?: string): string {
  return preprocessImportRow(
    { key: '', name: '', gender: '', idNumber: '', membershipGroup: '', phone: '', district: district ?? '', subCounty: '', country: country ?? '' },
    0
  ).country ?? 'Kenya';
}
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

export function parseCsvContent(content: string | Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const { headers, rows } = parseSpreadsheetContent(content);
  return { headers, rows };
}

export function validateCsvImport(
  content: string | Buffer,
  columnMapping?: Record<string, string>,
  options?: { fileName?: string }
): ImportValidationResponse {
  const sessionId = uuidv4();
  const { headers, rows, source, cooperativeHint } = parseSpreadsheetContent(content);
  const defaultMembershipGroup =
    cooperativeHint ||
    (options?.fileName ? inferCooperativeNameFromFileName(options.fileName) : null) ||
    undefined;
  const headersMatch = headersMatchExpected(headers);
  const mapping = columnMapping ?? (headersMatch ? undefined : suggestColumnMapping(headers));
  const parseRow = (rawRow: Record<string, string>) =>
    csvRowToFarmerInput(mapping ? applyColumnMapping(rawRow, mapping) : rawRow);

  const membershipGroups = getMembershipGroupNames();
  const existing = getExistingIdentifiers();
  const seenPhones = new Set<string>();
  const seenIdNumbers = new Set<string>();
  const seenKeys = new Set<string>();

  const validationResults: ValidationRowResult[] = [];
  const allErrors: ImportValidationResponse['errors'] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const farmerInput = parseRow(rawRow);

    const result = validateFarmerRow(farmerInput, {
      existingPhones: existing.phones,
      existingIdNumbers: existing.idNumbers,
      existingKeys: existing.keys,
      membershipGroups,
      rowNumber,
      importMode: true,
      defaultMembershipGroup,
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
    const input = parseRow(rows[i]);
    const country = (r.normalized.country ?? input.country ?? inferCountryFromDistrict(input.district)).trim();
    if (r.valid) {
      countryBreakdown[country] = (countryBreakdown[country] ?? 0) + 1;
    } else if (!r.duplicate) {
      errorsByCountry[country] = (errorsByCountry[country] ?? 0) + 1;
    }
  });

  const detectedCountry =
    Object.entries(countryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const fixedPreview = validationResults.slice(0, 10).map((r, i) => {
    const input = parseRow(rows[i]);
    return {
      name: r.normalized.name ?? input.name,
      phone: r.normalized.phone ?? input.phone,
      district: r.normalized.district ?? input.district,
      membershipGroup: r.normalized.membershipGroup ?? input.membershipGroup,
      country: r.normalized.country ?? inferCountryFromDistrict(input.district, input.country),
      status: (r.duplicate ? 'duplicate' : r.valid ? 'valid' : 'invalid') as 'valid' | 'invalid' | 'duplicate',
    };
  });

  const phoneMissingCount = validationResults.filter((r, i) =>
    r.errors.some((e) => e.field === 'phone' && !rowHasPhoneValue(rows[i]))
  ).length;

  const importHints: string[] = [];
  if (rows.length === 0 && source === 'xlsx') {
    importHints.push(
      'Excel workbook was read but no farmer rows were found. Check that the first sheet has a header row with Name and Phone/Mobile columns.'
    );
  } else if (rows.length === 0) {
    importHints.push(
      'No rows were found. If this is an Excel file (.xlsx), upload the original workbook — do not rename it to .csv. Or export from Excel using File → Save As → CSV (Comma delimited).'
    );
  }
  if (source === 'xlsx' && rows.length > 0) {
    importHints.push('Excel workbook detected — data was read from the first sheet.');
  }
  if (
    defaultMembershipGroup &&
    !headers.some((h) => /membership|group|association|cooperative|co-op|fpo|sacco/i.test(h))
  ) {
    importHints.push(
      `No cooperative column found — all farmers will be assigned to: "${defaultMembershipGroup}".`
    );
  }
  if (phoneMissingCount > 0) {
    importHints.push(
      `${phoneMissingCount} rows have no Phone number — add a Phone column so farmers can log in after import.`
    );
  }
  if (!headers.some((h) => PHONE_HEADER_PATTERN.test(h))) {
    importHints.push(
      'Your CSV has no Phone column. Cooperative list formats (S/N, Name, SEX, District) need a Phone column added before import.'
    );
  }
  const locationMissingCount = validationResults.filter((r) =>
    r.errors.some((e) => e.field === 'district' || e.field === 'subCounty')
  ).length;
  if (locationMissingCount > 0) {
    importHints.push(
      `${locationMissingCount} rows have no District/Sub-County — they can still import; farmers will confirm location when they first log in.`
    );
  }

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
    errors: allErrors,
    totalErrors: allErrors.length,
    preview: fixedPreview,
    headersMatch,
    columnMapping: mapping,
    sessionId,
    countryBreakdown,
    errorsByCountry,
    detectedCountry,
    importHints,
  };
}

export function getImportValidationErrors(sessionId: string): Array<{
  row: number;
  field: string;
  value: string;
  error: string;
  suggestion?: string;
}> {
  const session = db.prepare('SELECT errors FROM import_sessions WHERE id = ?').get(sessionId) as
    | { errors: string }
    | undefined;
  if (!session?.errors) return [];
  try {
    return JSON.parse(session.errors);
  } catch {
    return [];
  }
}

export function formatImportErrorsCsv(
  errors: Array<{ row: number; field: string; value: string; error: string; suggestion?: string }>
): string {
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Row,Field,Value,Error,Suggestion'];
  for (const e of errors) {
    lines.push([e.row, e.field, escape(e.value), escape(e.error), escape(e.suggestion ?? '')].join(','));
  }
  return lines.join('\n');
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
