import { Platform } from 'react-native';
import { getImportErrorsCsv } from '../api/client';

export interface ImportErrorRow {
  row: number;
  field: string;
  value: string;
  error: string;
  suggestion?: string;
}

function escapeCsv(value: string): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function importErrorsToCsv(errors: ImportErrorRow[]): string {
  const lines = ['Row,Field,Value,Error,Suggestion'];
  for (const e of errors) {
    lines.push([e.row, e.field, escapeCsv(e.value), escapeCsv(e.error), escapeCsv(e.suggestion ?? '')].join(','));
  }
  return lines.join('\n');
}

export function downloadTextFile(content: string, fileName: string): void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  throw new Error('DOWNLOAD_UNSUPPORTED');
}

export function downloadImportErrorsCsv(errors: ImportErrorRow[], sourceFileName: string): void {
  const base = sourceFileName.replace(/\.[^.]+$/, '') || 'import';
  downloadTextFile(importErrorsToCsv(errors), `${base}-errors.csv`);
}

export async function fetchAndDownloadImportErrors(sessionId: string, sourceFileName: string): Promise<void> {
  const csv = await getImportErrorsCsv(sessionId);
  const base = sourceFileName.replace(/\.[^.]+$/, '') || 'import';
  downloadTextFile(csv, `${base}-errors.csv`);
}
