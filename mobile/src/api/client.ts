import axios from 'axios';
import { API_BASE_URL } from '../constants';
import type { RegistrationFormData } from '../types';
import type { AuthUser } from '../store/authStore';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const { useAuthStore } = await import('../store/authStore');
      await useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export interface ReferenceData {
  districts: string[];
  subCounties: Record<string, string[]>;
  membershipGroups: string[];
  projects: string[];
  membershipTypes: string[];
}

export async function requestOtp(phone: string) {
  const { data } = await api.post('/auth/request-otp', { phone });
  return data;
}

export async function verifyOtp(phone: string, code: string) {
  const { data } = await api.post<{ token: string; user: AuthUser }>('/auth/verify-otp', { phone, code });
  return data;
}

export async function devQuickLogin(phone: string) {
  const { data } = await api.post<{ token: string; user: AuthUser }>('/auth/dev-login', { phone });
  return data;
}

export async function checkBackendHealth(): Promise<boolean> {
  const base = API_BASE_URL.replace(/\/api$/, '');
  const timeoutMs = base.includes('onrender.com') ? 90000 : 8000;
  try {
    const { data } = await axios.get(`${base}/health`, { timeout: timeoutMs });
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function loginWithPassword(phone: string, password: string) {
  const { data } = await api.post('/auth/login', { phone, password });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data;
}

export async function fetchReferenceData(): Promise<ReferenceData> {
  const { data } = await api.get<ReferenceData>('/reference');
  return data;
}

export async function registerFarmer(farmerData: RegistrationFormData) {
  const { data } = await api.post('/farmers/register', farmerData);
  return data;
}

export async function validateCsvImportText(content: string) {
  const { data } = await api.post('/admin/farmers/import/validate-text', content, {
    headers: { 'Content-Type': 'text/plain' },
  });
  return data;
}

export async function confirmCsvImport(sessionId: string, skipDuplicates = true) {
  const { data } = await api.post('/admin/farmers/import/confirm', { sessionId, skipDuplicates });
  return data;
}

export async function getImportProgress(sessionId: string, importId: string) {
  const { data } = await api.get(`/admin/farmers/import/${sessionId}/progress`, { params: { importId } });
  return data;
}

export async function getImportComplete(sessionId: string) {
  const { data } = await api.get(`/admin/farmers/import/${sessionId}/complete`);
  return data;
}

export async function getFarmers(limit = 50, offset = 0, country?: string, q?: string) {
  const params: Record<string, string | number> = { limit, offset };
  if (country) params.country = country;
  if (q?.trim()) params.q = q.trim();
  const { data } = await api.get('/admin/farmers', { params });
  return data;
}

export async function searchFarmers(query: string, limit = 200) {
  const { data } = await api.get('/admin/farmers', {
    params: { limit, offset: 0, q: query.trim() },
  });
  return data;
}

export async function getFarmerById(farmerId: string) {
  const { data } = await api.get(`/admin/farmers/${farmerId}`);
  return data;
}

export async function getAdminDashboard() {
  const { data } = await api.get('/admin/dashboard');
  return data;
}

export async function getUsers(q?: string) {
  const { data } = await api.get('/admin/users', { params: { q: q || undefined } });
  return data;
}

export async function getFarmerDashboard() {
  const { data } = await api.get('/farmer/dashboard');
  return data;
}

export async function updateFarmerLocation(body: {
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
}) {
  const { data } = await api.patch('/farmer/profile/location', body);
  return data;
}

export async function getFarmerProjects() {
  const { data } = await api.get('/farmer/projects');
  return data;
}

export async function getFarmerPayments() {
  const { data } = await api.get('/farmer/payments');
  return data;
}

export async function claimPayment(paymentId: string) {
  const { data } = await api.post(`/farmer/payments/${paymentId}/claim`);
  return data;
}

export async function getFarmerNotifications() {
  const { data } = await api.get('/farmer/notifications');
  return data;
}

// Phase 2 hierarchy
export async function getHierarchyDashboard() {
  const { data } = await api.get('/admin/hierarchy/dashboard');
  return data;
}

export async function getProgramProjects(programId?: string) {
  const { data } = await api.get('/admin/program-projects', { params: programId ? { program_id: programId } : {} });
  return data;
}

export async function getProgramProject(projectId: string) {
  const { data } = await api.get(`/admin/program-projects/${projectId}`);
  return data;
}

export async function assignFarmersToProgramProject(projectId: string, farmerIds: string[]) {
  const { data } = await api.post(`/admin/program-projects/${projectId}/assign-farmers`, { farmer_ids: farmerIds });
  return data;
}

export async function getPendingFarmerTasks(programProjectId?: string) {
  const { data } = await api.get('/admin/farmer-tasks/pending', {
    params: programProjectId ? { program_project_id: programProjectId } : {},
  });
  return data;
}

export async function approveFarmerTask(farmerTaskId: string, notes?: string) {
  const { data } = await api.post(`/admin/farmer-tasks/${farmerTaskId}/approve`, { notes });
  return data;
}

export async function rejectFarmerTask(farmerTaskId: string, rejection_reason: string) {
  const { data } = await api.post(`/admin/farmer-tasks/${farmerTaskId}/reject`, { rejection_reason });
  return data;
}

export async function getFarmerHierarchyProjects() {
  const { data } = await api.get('/farmer/hierarchy/projects');
  return data;
}

export async function getFarmerHierarchyTasks(params?: { status?: string; program_project_id?: string }) {
  const { data } = await api.get('/farmer/hierarchy/tasks', { params });
  return data;
}

export async function getFarmerHierarchyTask(farmerTaskId: string) {
  const { data } = await api.get(`/farmer/hierarchy/tasks/${farmerTaskId}`);
  return data;
}

export async function submitFarmerHierarchyTask(farmerTaskId: string, body: { photo_url?: string; notes?: string }) {
  const { data } = await api.post(`/farmer/hierarchy/tasks/${farmerTaskId}/submit`, body);
  return data;
}

export async function getFarmerPaymentPending() {
  const { data } = await api.get('/farmer/hierarchy/payment-pending');
  return data;
}

export async function getCentreDashboard(centreId?: string) {
  const path = centreId ? `/aggregation/centre/${centreId}/dashboard` : '/aggregation/centre/dashboard';
  const { data } = await api.get(path);
  return data;
}

export async function getCentreInventory(centreId?: string) {
  const path = centreId ? `/aggregation/centre/${centreId}/inventory` : '/aggregation/centre/inventory';
  const { data } = await api.get(path);
  return data;
}

export async function receiveCentreDelivery(centreId: string | 'self', body: {
  farmer_id: string;
  task_id?: string;
  product_name: string;
  quantity_received: number;
  unit?: string;
  notes?: string;
}) {
  const path = centreId === 'self'
    ? '/aggregation/centre/receive-delivery'
    : `/aggregation/centre/${centreId}/receive-delivery`;
  const { data } = await api.post(path, body);
  return data;
}

export async function approveInventoryQuality(inventoryId: string, body: {
  quality_status: 'approved' | 'rejected';
  quality_notes?: string;
  marketplace_price_per_unit?: number;
}) {
  const { data } = await api.post(`/aggregation/inventory/${inventoryId}/approve-quality`, body);
  return data;
}
