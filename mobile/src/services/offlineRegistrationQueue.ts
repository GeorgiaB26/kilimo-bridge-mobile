import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RegistrationFormData } from '../types';
import { getOfflineSqliteDb } from './offlineSqlite';

export interface PendingRegistration {
  id: string;
  formData: RegistrationFormData;
  pictureBase64?: string;
  createdAt: string;
  syncError?: string;
}

const ASYNC_KEY = 'kilimo_pending_registrations_v1';

async function listFromAsync(): Promise<PendingRegistration[]> {
  const raw = await AsyncStorage.getItem(ASYNC_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as PendingRegistration[];
}

async function saveToAsync(items: PendingRegistration[]): Promise<void> {
  await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(items));
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  const sqliteDb = await getOfflineSqliteDb();
  if (!sqliteDb) return listFromAsync();
  const rows = await sqliteDb.getAllAsync<{
    id: string;
    form_json: string;
    picture_base64: string | null;
    created_at: string;
    sync_error: string | null;
  }>('SELECT * FROM pending_registrations ORDER BY created_at DESC');
  return rows.map((row) => ({
    id: row.id,
    formData: JSON.parse(row.form_json) as RegistrationFormData,
    pictureBase64: row.picture_base64 ?? undefined,
    createdAt: row.created_at,
    syncError: row.sync_error ?? undefined,
  }));
}

export async function savePendingRegistration(
  entry: Omit<PendingRegistration, 'createdAt'> & { createdAt?: string }
): Promise<PendingRegistration> {
  const item: PendingRegistration = {
    ...entry,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  const sqliteDb = await getOfflineSqliteDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    items.unshift(item);
    await saveToAsync(items);
    return item;
  }
  await sqliteDb.runAsync(
    'INSERT OR REPLACE INTO pending_registrations (id, form_json, picture_base64, created_at, sync_error) VALUES (?, ?, ?, ?, ?)',
    [
      item.id,
      JSON.stringify(item.formData),
      item.pictureBase64 ?? null,
      item.createdAt,
      item.syncError ?? null,
    ]
  );
  return item;
}

export async function removePendingRegistration(id: string): Promise<void> {
  const sqliteDb = await getOfflineSqliteDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.filter((i) => i.id !== id));
    return;
  }
  await sqliteDb.runAsync('DELETE FROM pending_registrations WHERE id = ?', [id]);
}

export async function updatePendingSyncError(id: string, error: string): Promise<void> {
  const sqliteDb = await getOfflineSqliteDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? { ...i, syncError: error } : i)));
    return;
  }
  await sqliteDb.runAsync('UPDATE pending_registrations SET sync_error = ? WHERE id = ?', [error, id]);
}
