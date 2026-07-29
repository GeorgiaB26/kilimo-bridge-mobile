import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { CREATE_LOCAL_SCHEMA, LOCAL_DB_NAME } from './localSchema';

let db: SQLite.SQLiteDatabase | null = null;

export const isNativeOfflineCapable =
  Platform.OS === 'ios' || Platform.OS === 'android';

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (!isNativeOfflineCapable) return null;
  if (!db) {
    db = await SQLite.openDatabaseAsync(LOCAL_DB_NAME);
    await db.execAsync(CREATE_LOCAL_SCHEMA);
  }
  return db;
}

export async function clearLocalDb(): Promise<void> {
  if (!isNativeOfflineCapable) return;
  const database = await getLocalDb();
  if (!database) return;
  await database.execAsync(`
    DELETE FROM farmers;
    DELETE FROM farmer_tasks;
    DELETE FROM sync_queue;
    DELETE FROM sync_log;
  `);
}
