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

async function listFromAsync(): Promise<PendingRegistration[]> {
  const raw = await AsyncStorage.getItem(ASYNC_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as PendingRegistration[];
}

async function saveToAsync(items: PendingRegistration[]): Promise<void> {
  await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(items));
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  return listFromAsync();
}

export async function savePendingRegistration(
  entry: Omit<PendingRegistration, 'createdAt'> & { createdAt?: string }
): Promise<PendingRegistration> {
  const item: PendingRegistration = {
    ...entry,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  const items = await listFromAsync();
  items.unshift(item);
  await saveToAsync(items);
  return item;
}

export async function removePendingRegistration(id: string): Promise<void> {
  const items = await listFromAsync();
  await saveToAsync(items.filter((i) => i.id !== id));
}

export async function updatePendingSyncError(id: string, error: string): Promise<void> {
  const items = await listFromAsync();
  await saveToAsync(items.map((i) => (i.id === id ? { ...i, syncError: error } : i)));
}
