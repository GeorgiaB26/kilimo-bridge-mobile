import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RegistrationFormData } from '../types';

export interface PendingRegistration {
  id: string;
  formData: RegistrationFormData;
  pictureBase64?: string;
  createdAt: string;
  syncError?: string;
}

const ASYNC_KEY = 'kilimo_pending_registrations_v1';
const DB_NAME = 'kilimo_offline.db';

type OfflineSqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  getAllAsync: <T>(sql: string) => Promise<T[]>;
  runAsync: (sql: string, params?: (string | number | null)[]) => Promise<void>;
};

let dbReady = false;
let sqliteDb: OfflineSqliteDb | null = null;

async function initDb(): Promise<void> {
  if (dbReady) return;
  if (Platform.OS === 'web') {
    dbReady = true;
    return;
  }
  try {
    const { openDatabaseAsync } = await import('expo-sqlite');
    const database = await openDatabaseAsync(DB_NAME);
    sqliteDb = database as OfflineSqliteDb;
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id TEXT PRIMARY KEY NOT NULL,
        form_json TEXT NOT NULL,
        picture_base64 TEXT,
        created_at TEXT NOT NULL,
        sync_error TEXT
      );
    `);
  } catch {
    sqliteDb = null;
  }
  dbReady = true;
}

async function listFromAsync(): Promise<PendingRegistration[]> {
  const raw = await AsyncStorage.getItem(ASYNC_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as PendingRegistration[];
}

async function saveToAsync(items: PendingRegistration[]): Promise<void> {
  await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(items));
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  await initDb();
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
  await initDb();
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
  await initDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.filter((i) => i.id !== id));
    return;
  }
  await sqliteDb.runAsync('DELETE FROM pending_registrations WHERE id = ?', [id]);
}

export async function updatePendingSyncError(id: string, error: string): Promise<void> {
  await initDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? { ...i, syncError: error } : i)));
    return;
  }
  await sqliteDb.runAsync('UPDATE pending_registrations SET sync_error = ? WHERE id = ?', [error, id]);
}
