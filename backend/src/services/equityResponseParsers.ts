/**
 * Equity Bank response file parsers (ACK / NACK / PSR).
 *
 * No SFTP — parse plaintext samples or downloaded files. Matching must use
 * identifiers (file reference, customer reference, transaction id), never
 * original CSV row order (Equity does not preserve order).
 */

export type EquityAckParseResult = {
  kind: 'ack';
  /** Filename stem embedded in field 0 of the sample ACK. */
  outboundFilenameStem: string;
  fileReference: string;
  /** Opaque third field from sample (e.g. 54307369022) — meaning pending Equity confirmation. */
  field2: string;
  field3: string;
  statusCode: string;
  statusCode2: string;
  message: string;
  rawLine: string;
};

export type EquityNackFileSummary = {
  outboundFilenameStem: string;
  fileReference: string;
  field2: string;
  field3: string;
  statusCode: string;
  statusCode2: string;
  summaryMessage: string;
  /** Trailing empty fields present on the 16-field summary line. */
  rawFieldCount: number;
};

export type EquityNackRecord = {
  fileReference: string;
  customerReference: string;
  equityTransactionId: string;
  statusCode: string;
  errorCode: string;
  /** Full description; may contain pipe-delimited multiple errors. */
  errorDescription: string;
  errorMessages: string[];
};

export type EquityNackParseResult = {
  kind: 'nack';
  summary: EquityNackFileSummary;
  records: EquityNackRecord[];
};

export type EquityPsrStatus = 'success' | 'verification_failure' | 'unknown';

export type EquityPsrRecord = {
  equityTransactionId: string;
  fileReference: string;
  customerReference: string;
  /** Raw Status column — do not infer failure from Error Description alone. */
  statusRaw: string;
  status: EquityPsrStatus;
  paymentType: string;
  debitAccountNumber: string;
  debitCurrency: string;
  debitAmount: string;
  beneficiaryName: string;
  creditAccountNumber: string;
  beneficiaryBankCode: string;
  creditCurrency: string;
  creditAmount: string;
  exchangeRates: string;
  dealReference: string;
  paymentDate: string;
  chargeType: string;
  routingCode: string;
  errorCode: string;
  /**
   * Warning: successful PSR rows in the sample put the literal "Success" in
   * Error Description. Treat Status as authoritative; never treat a non-empty
   * Error Description as failure by itself.
   */
  errorDescription: string;
  errorMessages: string[];
};

export type EquityPsrParseResult = {
  kind: 'psr';
  records: EquityPsrRecord[];
};

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function splitPipeErrors(description: string): string[] {
  if (!description.trim()) return [];
  return description
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function nonEmptyLines(text: string): string[] {
  return normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

export function mapPsrStatus(raw: string): EquityPsrStatus {
  const t = raw.trim().toLowerCase();
  if (t === 'success') return 'success';
  if (t === 'verification failure') return 'verification_failure';
  return 'unknown';
}

/**
 * ACK — single headerless line, 7 fields in the sample:
 * outboundStem, fileReference, field2, field3, ACPT, ACPT, message
 */
export function parseEquityAck(text: string): EquityAckParseResult {
  const lines = nonEmptyLines(text);
  if (lines.length !== 1) {
    throw new Error(`ACK expected exactly 1 data line, got ${lines.length}`);
  }
  const fields = splitCsvLine(lines[0]);
  if (fields.length < 7) {
    throw new Error(`ACK line expected ≥7 fields, got ${fields.length}`);
  }
  return {
    kind: 'ack',
    outboundFilenameStem: fields[0],
    fileReference: fields[1],
    field2: fields[2],
    field3: fields[3],
    statusCode: fields[4],
    statusCode2: fields[5],
    message: fields[6],
    rawLine: lines[0],
  };
}

/**
 * NACK — mixed arity:
 *   line 1: 16-field file summary (RJCT / "All Records Failed")
 *   following lines: 6-field per-record rejections
 *
 * Must NOT be parsed with header:true.
 */
export function parseEquityNack(text: string): EquityNackParseResult {
  const lines = nonEmptyLines(text);
  if (lines.length < 1) {
    throw new Error('NACK file is empty');
  }

  const summaryFields = splitCsvLine(lines[0]);
  if (summaryFields.length < 7) {
    throw new Error(`NACK summary line expected ≥7 fields, got ${summaryFields.length}`);
  }

  const summary: EquityNackFileSummary = {
    outboundFilenameStem: summaryFields[0],
    fileReference: summaryFields[1],
    field2: summaryFields[2],
    field3: summaryFields[3],
    statusCode: summaryFields[4],
    statusCode2: summaryFields[5],
    summaryMessage: summaryFields[6],
    rawFieldCount: summaryFields.length,
  };

  const records: EquityNackRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (fields.length < 6) {
      throw new Error(`NACK record line ${i + 1} expected 6 fields, got ${fields.length}`);
    }
    const errorDescription = fields[5];
    records.push({
      fileReference: fields[0],
      customerReference: fields[1],
      equityTransactionId: fields[2],
      statusCode: fields[3],
      errorCode: fields[4],
      errorDescription,
      errorMessages: splitPipeErrors(errorDescription),
    });
  }

  return { kind: 'nack', summary, records };
}

const PSR_HEADERS = [
  'Transaction ID',
  'Reference Number',
  'Customer Reference',
  'Status',
  'Payment Type',
  'Debit Account Number',
  'Debit Currency',
  'Debit Amount',
  'Beneficiary Name',
  'Credit Account Number',
  'Beneficiary bank & Branch Code / Swift Code',
  'Credit Currency',
  'Credit Amount',
  'Exchange Rates',
  'Deal Reference',
  'Payment Date',
  'Remitter Information',
  'Remitter Information 2',
  'Remitter Information 3',
  'Remitter Information 4',
  'Intermediate Account',
  'Intermediate Swift',
  'Charge Type',
  'Routing Code',
  'Error Code',
  'Error Description',
] as const;

/**
 * PSR — header row + 26 columns. Status column is authoritative.
 * Match payments by equityTransactionId / (fileReference + customerReference),
 * never by row index.
 */
export function parseEquityPsr(text: string): EquityPsrParseResult {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) {
    throw new Error('PSR expected a header row plus at least one data row');
  }

  const headerFields = splitCsvLine(lines[0]);
  if (headerFields.length < PSR_HEADERS.length) {
    throw new Error(
      `PSR header expected ${PSR_HEADERS.length} columns, got ${headerFields.length}`
    );
  }

  const records: EquityPsrRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (fields.length < PSR_HEADERS.length) {
      throw new Error(
        `PSR data line ${i + 1} expected ${PSR_HEADERS.length} fields, got ${fields.length}`
      );
    }

    const statusRaw = fields[3];
    const errorDescription = fields[25];
    const status = mapPsrStatus(statusRaw);

    records.push({
      equityTransactionId: fields[0],
      fileReference: fields[1],
      customerReference: fields[2],
      statusRaw,
      status,
      paymentType: fields[4],
      debitAccountNumber: fields[5],
      debitCurrency: fields[6],
      debitAmount: fields[7],
      beneficiaryName: fields[8],
      creditAccountNumber: fields[9],
      beneficiaryBankCode: fields[10],
      creditCurrency: fields[11],
      creditAmount: fields[12],
      exchangeRates: fields[13],
      dealReference: fields[14],
      paymentDate: fields[15],
      chargeType: fields[22],
      routingCode: fields[23],
      errorCode: fields[24],
      errorDescription,
      // Only split pipes on failure-like rows; keep Success literal as a single token.
      errorMessages:
        status === 'success' ? [] : splitPipeErrors(errorDescription === 'Success' ? '' : errorDescription),
    });
  }

  return { kind: 'psr', records };
}

export type EquityResponseParseResult =
  | EquityAckParseResult
  | EquityNackParseResult
  | EquityPsrParseResult;

/**
 * Infer kind from filename conventions in Equity's samples:
 *   ACK__…  NACK__…  PSR_…
 */
export function detectEquityResponseKind(
  filename: string
): 'ack' | 'nack' | 'psr' | null {
  const base = filename.split(/[/\\]/).pop() || filename;
  if (/^ACK__/i.test(base) || /^ACK_/i.test(base)) return 'ack';
  if (/^NACK__/i.test(base) || /^NACK_/i.test(base)) return 'nack';
  if (/^PSR_/i.test(base)) return 'psr';
  return null;
}

export function parseEquityResponseFile(
  filename: string,
  text: string
): EquityResponseParseResult {
  const kind = detectEquityResponseKind(filename);
  if (!kind) {
    throw new Error(`Cannot detect Equity response kind from filename: ${filename}`);
  }
  if (kind === 'ack') return parseEquityAck(text);
  if (kind === 'nack') return parseEquityNack(text);
  return parseEquityPsr(text);
}

/** Index helpers for reconciliation (reference-based, not positional). */
export function indexPsrByCustomerReference(
  parsed: EquityPsrParseResult
): Map<string, EquityPsrRecord[]> {
  const map = new Map<string, EquityPsrRecord[]>();
  for (const record of parsed.records) {
    const list = map.get(record.customerReference) ?? [];
    list.push(record);
    map.set(record.customerReference, list);
  }
  return map;
}

export function indexNackByCustomerReference(
  parsed: EquityNackParseResult
): Map<string, EquityNackRecord[]> {
  const map = new Map<string, EquityNackRecord[]>();
  for (const record of parsed.records) {
    const list = map.get(record.customerReference) ?? [];
    list.push(record);
    map.set(record.customerReference, list);
  }
  return map;
}
