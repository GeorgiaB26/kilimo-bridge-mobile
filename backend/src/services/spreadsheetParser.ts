import Papa from 'papaparse';
import XLSX from 'xlsx';
import { PHONE_HEADER_PATTERN } from '../../../shared/src/validation';

export const BINARY_IMPORT_PREFIX = '__KB_XLSX_BASE64__:';

export function isExcelBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function isExcelTextContent(content: string): boolean {
  if (!content) return false;
  const head = content.slice(0, 4);
  return head.charCodeAt(0) === 0x50 && head.charCodeAt(1) === 0x4b && head.charCodeAt(2) === 0x03;
}

export function decodeImportPayload(content: string | Buffer): Buffer | string {
  if (Buffer.isBuffer(content)) {
    return isExcelBuffer(content) ? content : content.toString('utf-8');
  }

  if (content.startsWith(BINARY_IMPORT_PREFIX)) {
    return Buffer.from(content.slice(BINARY_IMPORT_PREFIX.length), 'base64');
  }

  if (isExcelTextContent(content)) {
    return Buffer.from(content, 'latin1');
  }

  return content;
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function normalizeCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => normalizeCell(c).toLowerCase());
    const hasName = cells.some((c) =>
      c === 'name' ||
      c === 'farmer name' ||
      c === 'full name' ||
      c === 'name of farmer' ||
      c.includes('farmer name') ||
      (c.includes('name') && !c.includes('group') && !c.includes('association'))
    );
    const hasDataHeader = cells.some((c) =>
      [
        'phone',
        'mobile',
        'contact',
        'tel',
        'district',
        'county',
        'sub-county',
        'sub county',
        's/n',
        'sn',
        'sex',
        'gender',
        'membership group',
        'memebrship group',
        'names of grpops',
        'names of grpsops',
        'names of groups',
        'id number',
        'national id',
      ].includes(c) || PHONE_HEADER_PATTERN.test(c)
    );
    if (hasName && hasDataHeader) return i;
  }
  return 0;
}

function extractCooperativeHint(matrix: string[][], headerIdx: number): string | null {
  for (let i = 0; i < headerIdx; i++) {
    const text = matrix[i].filter((cell) => cell).join(' ').trim();
    if (text.length < 10) continue;
    if (/farmer|association|cooperative|co-op|fpo|sacco|leoart|grp|group|society/i.test(text)) {
      return text;
    }
  }
  return null;
}

function matrixToRows(matrix: string[][]): {
  headers: string[];
  rows: Record<string, string>[];
  cooperativeHint?: string;
} {
  const cleaned = matrix
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell));

  if (cleaned.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerIdx = findHeaderRowIndex(cleaned);
  const cooperativeHint = extractCooperativeHint(cleaned, headerIdx) ?? undefined;
  const headers = cleaned[headerIdx].map((h) => h.trim());
  const dataRows = cleaned.slice(headerIdx + 1);

  const rows = dataRows
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        if (header) obj[header] = (cells[i] ?? '').trim();
      });
      return obj;
    })
    .filter((row) => {
      const name = Object.entries(row).find(([key]) => /name/i.test(key) && !/group|association/i.test(key))?.[1]?.trim() ?? '';
      return name.length >= 2 && !/^name$/i.test(name);
    });

  return { headers, rows, cooperativeHint };
}

function parseExcelBuffer(buffer: Buffer): {
  headers: string[];
  rows: Record<string, string>[];
  cooperativeHint?: string;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][];

  return matrixToRows(matrix);
}

function parseCsvText(content: string): {
  headers: string[];
  rows: Record<string, string>[];
  cooperativeHint?: string;
} {
  const delimiter = detectDelimiter(content);
  const raw = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
    delimiter,
  });

  return matrixToRows((raw.data as string[][]) ?? []);
}

export function parseSpreadsheetContent(
  content: string | Buffer
): { headers: string[]; rows: Record<string, string>[]; source: 'csv' | 'xlsx'; cooperativeHint?: string } {
  const decoded = decodeImportPayload(content);

  if (Buffer.isBuffer(decoded)) {
    if (!isExcelBuffer(decoded)) {
      return { ...parseCsvText(decoded.toString('utf-8')), source: 'csv' };
    }
    return { ...parseExcelBuffer(decoded), source: 'xlsx' };
  }

  if (isExcelTextContent(decoded)) {
    const buffer = Buffer.from(decoded, 'latin1');
    return { ...parseExcelBuffer(buffer), source: 'xlsx' };
  }

  return { ...parseCsvText(decoded), source: 'csv' };
}
