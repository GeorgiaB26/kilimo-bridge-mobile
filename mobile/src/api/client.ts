import axios from 'axios';
import { API_BASE_URL } from '../constants';
import type { RegistrationFormData } from '../types';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ReferenceData {
  districts: string[];
  subCounties: Record<string, string[]>;
  membershipGroups: string[];
  projects: string[];
  membershipTypes: string[];
}

export async function fetchReferenceData(): Promise<ReferenceData> {
  const { data } = await api.get<ReferenceData>('/reference');
  return data;
}

export async function registerFarmer(farmerData: RegistrationFormData) {
  const { data } = await api.post('/farmers/register', farmerData);
  return data;
}

export async function validateCsvImport(formData: FormData) {
  const { data } = await api.post('/admin/farmers/import/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function confirmCsvImport(sessionId: string, skipDuplicates = true) {
  const { data } = await api.post('/admin/farmers/import/confirm', { sessionId, skipDuplicates });
  return data;
}

export async function getImportProgress(sessionId: string, importId: string) {
  const { data } = await api.get(`/admin/farmers/import/${sessionId}/progress`, {
    params: { importId },
  });
  return data;
}

export async function getImportComplete(sessionId: string) {
  const { data } = await api.get(`/admin/farmers/import/${sessionId}/complete`);
  return data;
}

export async function getFarmers(limit = 50, offset = 0) {
  const { data } = await api.get('/farmers', { params: { limit, offset } });
  return data;
}
