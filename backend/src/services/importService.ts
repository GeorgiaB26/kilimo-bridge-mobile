import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
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
  normalizeGender,
  type FarmerInput,
} from '../../../shared/src/validation';

function inferCountryFromDistrict(district?: string, country?: string): string {
  return preprocessImportRow(
    { key: '', name: '', gender: '', idNumber: '', membershipGroup: '', phone: '', district: district ?? '', subCounty: '', country: country ?? '' },
    0
  ).country ?? 'Kenya';
}
import { getMembershipGroupNames, getExistingIdentifiers, importFarmerFromCsv } from './farmerService';
import { hashIdNumber } from './encryptionService';
import { normalizeIdNumber } from '../../../shared/src/validation';
import {
  findSimilarProgramProject,
  formatSimilarProjectHint,
  getProgramProjectCatalog,
} from './farmerProgramService';
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

export async function validateCsvImport(
  content: string | Buffer,
  columnMapping?: Record<string, string>,
  options?: { fileName?: string }
): Promise<ImportValidationResponse> {
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

  const membershipGroups = await getMembershipGroupNames();
  const existing = await getExistingIdentifiers();
  const programProjectCatalog = await getProgramProjectCatalog();
  const seenPhones = new Set<string>();
  const seenIdNumbers = new Set<string>();
  const seenKeys = new Set<string>();
  const projectSimilarityHints = new Set<string>();

  const validationResults: ValidationRowResult[] = [];
  const allErrors: ImportValidationResponse['errors'] = [];
  let genderNormalizedCount = 0;
  let genderInvalidCount = 0;
  const genderNormalizationExamples = new Set<string>();

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const farmerInput = parseRow(rawRow);

    const result = validateFarmerRow(farmerInput, {
      existingPhones: existing.phones,
      existingIdNumberHashes: existing.idNumberHashes,
      hashIdNumber,
      existingKeys: existing.keys,
      membershipGroups,
      rowNumber,
      importMode: true,
      defaultMembershipGroup,
    });

    const rawGender = farmerInput.gender?.trim() ?? '';
    const normalizedGender = result.normalized.gender;
    if (rawGender && normalizedGender && rawGender !== normalizedGender) {
      genderNormalizedCount++;
      genderNormalizationExamples.add(`${rawGender}→${normalizedGender}`);
    }
    if (result.errors.some((e) => e.field === 'gender')) {
      genderInvalidCount++;
    } else if (rawGender && !normalizeGender(rawGender)) {
      genderInvalidCount++;
    }

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
    if (idNum) {
      const idHash = hashIdNumber(normalizeIdNumber(idNum));
      if (seenIdNumbers.has(idHash) || existing.idNumberHashes.has(idHash)) {
        duplicate = true;
        if (!result.errors.some((e) => e.field === 'idNumber')) {
          result.errors.push({
            field: 'idNumber',
            value: farmerInput.idNumber,
            error: 'Duplicate ID number in file or system',
          });
        }
      }
      seenIdNumbers.add(idHash);
    }
    if (key && (seenKeys.has(key) || existing.keys.has(key))) duplicate = true;

    if (phone) seenPhones.add(phone);
    if (key) seenKeys.add(key);

    for (const rawProject of [farmerInput.project1, farmerInput.project2, farmerInput.project3]) {
      if (!rawProject?.trim()) continue;
      const similar = findSimilarProgramProject(rawProject, programProjectCatalog);
      if (similar) {
        projectSimilarityHints.add(formatSimilarProjectHint(rowNumber, rawProject, similar));
      }
    }

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
  if (genderNormalizedCount > 0) {
    const examples = [...genderNormalizationExamples].slice(0, 5).join(', ');
    importHints.push(
      `${genderNormalizedCount} row(s) had gender spellings normalized to Postgres enum values (M/F/Other) — e.g. ${examples}. Only exact enum values are stored in the database.`
    );
  }
  if (genderInvalidCount > 0) {
    importHints.push(
      `${genderInvalidCount} row(s) have gender values that cannot be mapped to M, F, or Other (Postgres gender_type enum). Fix spellings like "Female"/"FEMALE" are auto-mapped; unknown values are rejected.`
    );
  }
  for (const hint of projectSimilarityHints) {
    importHints.push(hint);
  }
  importHints.push(
    'National ID duplicates are checked via id_number_hash when importing.'
  );

  await query(
    `INSERT INTO import_sessions (id, status, total_rows, valid_rows, invalid_rows, duplicates, data, errors)
     VALUES ($1, 'validated', $2, $3, $4, $5, $6, $7)`,
    [
      sessionId,
      rows.length,
      validRows,
      invalidRows,
      duplicates,
      JSON.stringify(validationResults),
      JSON.stringify(allErrors),
    ]
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

export async function getImportValidationErrors(sessionId: string): Promise<Array<{
  row: number;
  field: string;
  value: string;
  error: string;
  suggestion?: string;
}>> {
  const session = await queryOne<{ errors: string }>(
    'SELECT errors FROM import_sessions WHERE id = $1',
    [sessionId]
  );
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
  const session = await queryOne<{
    id: string;
    data: string;
    valid_rows: number;
  }>('SELECT * FROM import_sessions WHERE id = $1', [sessionId]);

  if (!session) throw new Error('Import session not found');

  const importId = uuidv4();
  const validationResults: ValidationRowResult[] =
    typeof session.data === 'string' ? JSON.parse(session.data) : (session.data as ValidationRowResult[]);
  const toImport = validationResults.filter((r) => r.valid && (!skipDuplicates || !r.duplicate));

  await query('UPDATE import_sessions SET status = $1 WHERE id = $2', ['importing', sessionId]);

  const estimatedTimeSeconds = Math.ceil(toImport.length / 50);

  setTimeout(() => {
    void runImport(importId, sessionId, toImport, registeredBy);
  }, 100);

  return {
    importId,
    totalToImport: toImport.length,
    estimatedTimeSeconds,
  };
}

async function runImport(
  importId: string,
  sessionId: string,
  rows: ValidationRowResult[],
  registeredBy?: string
): Promise<void> {
  let imported = 0;
  const total = rows.length;
  const importErrors: Array<{ row: number; field: string; value: string; error: string }> = [];

  const batchSize = Math.max(1, Math.floor(total / 10));

  const interval = setInterval(() => {
    void (async () => {
      const end = Math.min(imported + batchSize, total);
      for (let i = imported; i < end; i++) {
        const row = rows[i];
        try {
          const data = row.normalized as FarmerInput & { key: string; phone: string };
          await importFarmerFromCsv(data, registeredBy);
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

      await query('UPDATE import_sessions SET imported_count = $1 WHERE id = $2', [imported, sessionId]);

      if (imported >= total) {
        clearInterval(interval);
        await query(
          `UPDATE import_sessions SET status = 'complete', completed_at = NOW(), errors = $1
           WHERE id = $2`,
          [JSON.stringify(importErrors), sessionId]
        );
        activeImports.set(importId, { status: 'complete' });
      }
    })();
  }, 500);

  activeImports.set(importId, { interval, status: 'in_progress' });
}

export async function getImportProgress(importId: string, sessionId: string) {
  const session = await queryOne<{
    imported_count: number;
    valid_rows: number;
    status: string;
    errors: string;
  }>('SELECT * FROM import_sessions WHERE id = $1', [sessionId]);

  if (!session) return null;

  const total = session.valid_rows;
  const imported = session.imported_count;
  const percent =
    total > 0
      ? imported >= total || session.status === 'complete'
        ? 100
        : Math.min(99, Math.round((imported / total) * 100))
      : session.status === 'complete'
        ? 100
        : 0;
  const status = session.status === 'complete' ? 'complete' : 'in_progress';

  return {
    importId,
    importedCount: imported,
    totalCount: total,
    percentComplete: percent,
    status,
  };
}

export async function getImportComplete(sessionId: string) {
  const session = await queryOne<{
    id: string;
    imported_count: number;
    duplicates: number;
    errors: string;
    completed_at: string;
    status: string;
  }>('SELECT * FROM import_sessions WHERE id = $1', [sessionId]);

  if (!session || session.status !== 'complete') return null;

  const errors =
    typeof session.errors === 'string'
      ? JSON.parse(session.errors || '[]')
      : (session.errors ?? []);
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
