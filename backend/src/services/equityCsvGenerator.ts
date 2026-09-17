/**
 * Equity Bank outbound payment-batch CSV generator (SFTP file channel).
 *
 * Generates TMP224-style files with MW (mobile wallet / M-Pesa) rows only for
 * Kilimo Bridge farmer disbursements. Does not upload — plaintext CSV only.
 *
 * Spec unknowns are flagged inline as "pending Equity confirmation".
 */

import { createHash, randomBytes } from 'crypto';

/** Exact header order from Equity's sample outbound file. */
export const EQUITY_CSV_HEADERS = [
  'Transaction Type Code',
  'Debit Account No.',
  'Beneficiary Account No.',
  'Beneficiary Name',
  'Beneficiary Bank Swift Code / Local Bank Code',
  'Purpose Code',
  'Purpose Of Payment',
  'Transaction Currency',
  'Payment Amount',
  'Payment Type',
  'Beneficiary Mobile No',
  'Service Provider',
  'Charge Type',
  'Value Date',
  'Customer Reference No',
  'Deal Reference No',
] as const;

export type EquityCsvHeader = (typeof EQUITY_CSV_HEADERS)[number];

/** Farmer M-Pesa disbursement — the only row type we emit today. */
export const EQUITY_TX_TYPE_MOBILE_WALLET = 'MW';

export const EQUITY_SERVICE_PROVIDER_MPESA = 'MPESA';
export const EQUITY_CHARGE_TYPE_OUR = 'OUR';

export type EquityBatchFileConfig = {
  templateId: string;
  customerId: string;
  entityCode: string;
  /** Fixed segment in sample filenames (`MD`) — meaning pending Equity confirmation. */
  filenameMiddleSegment?: string;
  debitAccountNo: string;
  /** Calendar date used for Value Date and filename (local business date). */
  valueDate: Date;
  sequenceNo: number;
  currency?: string;
  serviceProvider?: string;
  chargeType?: string;
  /**
   * pending Equity confirmation: Purpose Code is blank on MW rows in the sample
   * (populated as SALA only on LBT/TT). We leave it blank until Equity confirms.
   */
  purposeCode?: string;
  purposeOfPayment?: string;
};

export type EquityMwPaymentLine = {
  /** Already-created bank_transactions.id (uuid). Used only to seed uniqueness. */
  bankTransactionId: string;
  beneficiaryName: string;
  /**
   * Digits only preferred. Caller should normalise to 10- or 12-digit form
   * Equity accepts (pending Equity confirmation of exact format).
   */
  beneficiaryMobileNo: string;
  /** Integer minor-unit amount as stored in payments.amount (KES whole shillings today). */
  amount: number;
  /**
   * Optional override. If omitted we generate a short opaque Customer Reference.
   * pending Equity confirmation: max length / charset of Customer Reference No.
   */
  customerReference?: string;
};

export type EquityCsvRow = Record<EquityCsvHeader, string>;

export type EquityGeneratedBatchFile = {
  filename: string;
  /** CSV body with CRLF line endings and trailing CRLF. */
  content: string;
  sha256: string;
  valueDateFormatted: string;
  sequenceNo: number;
  rows: EquityCsvRow[];
  /** customer_reference per input line, same order as `lines`. */
  customerReferences: string[];
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Equity sample Value Date format: DD-MM-YYYY */
export function formatEquityValueDate(date: Date): string {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/** Filename date segment: DDMMYYYY */
export function formatEquityFilenameDate(date: Date): string {
  return `${pad2(date.getDate())}${pad2(date.getMonth() + 1)}${date.getFullYear()}`;
}

/**
 * Short opaque Customer Reference No.
 *
 * Sample values were tiny integers (`70`, `71`). We emit 12 URL-safe chars derived
 * from the bank_transaction id + entropy so duplicates within a batch are
 * vanishingly unlikely, without embedding a full UUID (Equity length limits unknown).
 *
 * pending Equity confirmation: maximum length and allowed character set.
 */
export function generateCustomerReference(bankTransactionId: string): string {
  const hash = createHash('sha256')
    .update(bankTransactionId)
    .update(randomBytes(4))
    .digest('base64url')
    .replace(/[^A-Za-z0-9]/g, '');
  return hash.slice(0, 12);
}

/** Escape a CSV field (RFC-style quotes when needed). */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildEquityBatchFilename(config: EquityBatchFileConfig): string {
  const mid = config.filenameMiddleSegment ?? 'MD';
  const datePart = formatEquityFilenameDate(config.valueDate);
  const seq = String(config.sequenceNo).padStart(3, '0');
  // Sample: TMP224_56010646936_56010646936_MD_17092026_DRAPIUS_001.csv
  return `${config.templateId}_${config.customerId}_${config.customerId}_${mid}_${datePart}_${config.entityCode}_${seq}.csv`;
}

/**
 * pending Equity confirmation: Payment Amount decimals.
 * Sample values are whole numbers only; payments.amount is INTEGER.
 * We emit the integer as a plain decimal string with no fractional part.
 */
function formatPaymentAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid payment amount: ${amount}`);
  }
  if (!Number.isInteger(amount)) {
    throw new Error(
      `Payment Amount must be an integer until Equity confirms decimal handling (got ${amount})`
    );
  }
  return String(amount);
}

/**
 * Strip non-digits for the mobile field. Does not invent country-code rules —
 * caller supplies a number Equity will accept (pending confirmation).
 */
export function digitsOnlyMobile(mobile: string): string {
  return mobile.replace(/\D/g, '');
}

export function buildMwCsvRow(
  config: EquityBatchFileConfig,
  line: EquityMwPaymentLine,
  customerReference: string
): EquityCsvRow {
  const mobile = digitsOnlyMobile(line.beneficiaryMobileNo);
  if (mobile.length < 9) {
    throw new Error(`Beneficiary mobile looks too short after normalisation: ${mobile}`);
  }

  return {
    'Transaction Type Code': EQUITY_TX_TYPE_MOBILE_WALLET,
    'Debit Account No.': config.debitAccountNo,
    'Beneficiary Account No.': '',
    'Beneficiary Name': line.beneficiaryName.trim(),
    'Beneficiary Bank Swift Code / Local Bank Code': '',
    // pending Equity confirmation: Purpose Code on MW rows (blank in sample)
    'Purpose Code': config.purposeCode ?? '',
    'Purpose Of Payment': config.purposeOfPayment ?? '',
    'Transaction Currency': config.currency ?? 'KES',
    // pending Equity confirmation: decimal / scale rules for Payment Amount
    'Payment Amount': formatPaymentAmount(line.amount),
    'Payment Type': '',
    'Beneficiary Mobile No': mobile,
    'Service Provider': config.serviceProvider ?? EQUITY_SERVICE_PROVIDER_MPESA,
    'Charge Type': config.chargeType ?? EQUITY_CHARGE_TYPE_OUR,
    'Value Date': formatEquityValueDate(config.valueDate),
    'Customer Reference No': customerReference,
    'Deal Reference No': '',
  };
}

/** Serialise rows to CRLF CSV matching Equity's outbound sample line endings. */
export function serializeEquityCsv(rows: EquityCsvRow[]): string {
  const headerLine = EQUITY_CSV_HEADERS.map((h) => escapeCsvField(h)).join(',');
  const body = rows.map((row) =>
    EQUITY_CSV_HEADERS.map((h) => escapeCsvField(row[h] ?? '')).join(',')
  );
  return `${[headerLine, ...body].join('\r\n')}\r\n`;
}

export function generateEquityMwBatchFile(
  config: EquityBatchFileConfig,
  lines: EquityMwPaymentLine[]
): EquityGeneratedBatchFile {
  if (lines.length === 0) {
    throw new Error('Cannot generate an Equity batch with zero payment lines');
  }
  if (!Number.isInteger(config.sequenceNo) || config.sequenceNo < 1) {
    throw new Error(`sequenceNo must be a positive integer (got ${config.sequenceNo})`);
  }

  const customerReferences: string[] = [];
  const seen = new Set<string>();
  const rows: EquityCsvRow[] = [];

  for (const line of lines) {
    const ref = line.customerReference?.trim() || generateCustomerReference(line.bankTransactionId);
    if (seen.has(ref)) {
      throw new Error(`Duplicate Customer Reference No within batch: ${ref}`);
    }
    seen.add(ref);
    customerReferences.push(ref);
    rows.push(buildMwCsvRow(config, line, ref));
  }

  const filename = buildEquityBatchFilename(config);
  const content = serializeEquityCsv(rows);
  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');

  return {
    filename,
    content,
    sha256,
    valueDateFormatted: formatEquityValueDate(config.valueDate),
    sequenceNo: config.sequenceNo,
    rows,
    customerReferences,
  };
}

/** Load batch file settings from environment (Render / local). */
export function equityBatchConfigFromEnv(
  overrides: Partial<EquityBatchFileConfig> & Pick<EquityBatchFileConfig, 'valueDate' | 'sequenceNo'>
): EquityBatchFileConfig {
  const templateId = process.env.EQUITY_SFTP_TEMPLATE_ID?.trim();
  const customerId = process.env.EQUITY_SFTP_CUSTOMER_ID?.trim();
  const entityCode = process.env.EQUITY_SFTP_ENTITY_CODE?.trim();
  const debitAccountNo = process.env.EQUITY_SFTP_DEBIT_ACCOUNT?.trim();

  const missing = [
    !templateId && 'EQUITY_SFTP_TEMPLATE_ID',
    !customerId && 'EQUITY_SFTP_CUSTOMER_ID',
    !entityCode && 'EQUITY_SFTP_ENTITY_CODE',
    !debitAccountNo && 'EQUITY_SFTP_DEBIT_ACCOUNT',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing Equity batch env: ${missing.join(', ')}`);
  }

  return {
    templateId: templateId!,
    customerId: customerId!,
    entityCode: entityCode!,
    filenameMiddleSegment: process.env.EQUITY_SFTP_FILENAME_MD?.trim() || 'MD',
    debitAccountNo: debitAccountNo!,
    valueDate: overrides.valueDate,
    sequenceNo: overrides.sequenceNo,
    currency: overrides.currency,
    serviceProvider: overrides.serviceProvider,
    chargeType: overrides.chargeType,
    purposeCode: overrides.purposeCode,
    purposeOfPayment: overrides.purposeOfPayment,
  };
}
