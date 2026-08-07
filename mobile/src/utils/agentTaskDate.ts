import { formatCleanDate } from './greeting';

/** Parse DD/MM/YYYY or DD-MM-YYYY to ISO YYYY-MM-DD for API storage. */
export function parseAgentTaskDueDateInput(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const probe = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(probe.getTime())) return null;
  if (probe.getFullYear() !== year || probe.getMonth() + 1 !== month || probe.getDate() !== day) {
    return null;
  }
  return iso;
}

export function formatAgentTaskDueInput(value?: string | null): string {
  return formatCleanDate(value);
}

/** Auto-format digits into DD/MM/YYYY while typing. */
export function maskDdMmYyyyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
