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

export function getAuthToken(): string | null {
  return authToken;
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

export async function devTokenLogin(role: 'farmer' | 'field_agent', phone?: string) {
  const { data } = await api.post<{
    status: string;
    token: string;
    user: AuthUser;
    message?: string;
  }>('/auth/dev-token', { role, phone });
  return data;
}

export async function checkBackendHealth(): Promise<boolean> {
  const timeoutMs = API_BASE_URL.includes('onrender.com') ? 90000 : 8000;
  // Use /reference not /health — /health lacks CORS headers for browser requests from Netlify
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/reference`, { timeout: timeoutMs });
      if (Array.isArray(data?.districts)) return true;
    } catch {
      // API may still be booting on Render
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

export async function loginWithPassword(phone: string, password: string) {
  const { data } = await api.post('/auth/login', { phone, password });
  return data;
}

export async function selfRegister(body: {
  userType: 'farmer' | 'field_agent' | 'admin' | 'project_manager';
  name: string;
  phone: string;
  email?: string;
  password?: string;
  district?: string;
  region?: string;
  aggregationCenter?: string;
  governmentId?: string;
  sector?: string;
}) {
  const { data } = await api.post('/auth/self-register', body);
  return data as { success: boolean; message: string; pendingApproval?: boolean };
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

export async function validateCsvImportText(content: string, fileName?: string) {
  const { data } = await api.post('/admin/farmers/import/validate-text', content, {
    headers: {
      'Content-Type': 'text/plain',
      ...(fileName ? { 'X-Import-File-Name': fileName } : {}),
    },
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
  try {
    const { data } = await api.get(`/admin/farmers/import/${sessionId}/complete`);
    return data as {
      status: 'import_complete';
      importId: string;
      importedCount: number;
      duplicatesSkipped: number;
      errorsCount: number;
      timestamp: string;
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function getImportErrorsCsv(sessionId: string): Promise<string> {
  const base = API_BASE_URL.replace(/\/api$/, '');
  const token = api.defaults.headers.common.Authorization as string | undefined;
  const res = await fetch(`${base}/api/admin/farmers/import/${sessionId}/errors?format=csv`, {
    headers: token ? { Authorization: token } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.text();
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

/** Field agent farmer profile — uses agent-scoped endpoint (avoids region/district scope mismatch). */
export async function getAgentFarmerById(farmerId: string) {
  const { data } = await api.get(`/agents/farmers/${farmerId}`);
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

/** View-only: farmer's own aggregation centre (name, location, contact). */
export async function getFarmerMyCentre(): Promise<{
  centre: {
    name: string;
    location: string;
    managerName: string | null;
    managerPhone: string | null;
    country: string | null;
  } | null;
}> {
  const { data } = await api.get('/farmer/my-centre');
  return data;
}

/** All tasks for this farmer (program hierarchy + field agent assignments). */
export async function getFarmerAssignedTasks(params?: {
  status?: string;
  outstanding?: string;
}) {
  try {
    const { data } = await api.get('/farmer/assigned-tasks', { params });
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      const { data } = await api.get('/farmer/hierarchy/tasks', { params });
      return data;
    }
    throw err;
  }
}

export async function submitFarmerHelpRequest(message: string) {
  const { data } = await api.post('/farmer/help-requests', { message });
  return data;
}

export async function createSupportTicket(body: {
  subject: string;
  description: string;
  attachmentKeys?: string[];
}) {
  const { data } = await api.post<{
    threadId: string;
    ticket: SupportTicketSummary;
  }>('/support/tickets', body);
  return data;
}

export type SupportTicketStatus = 'open' | 'resolved';

export type SupportTicketSummary = {
  thread_id: string;
  subject: string;
  status: SupportTicketStatus;
  created_by_user_id: string;
  requester_role: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_content: string | null;
  unread_count: number;
};

export type SupportTicketMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  attachment_preview_url?: string | null;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
};

export type SupportTicketStats = {
  open: number;
  resolved: number;
  total: number;
  unread_open: number;
};

export async function getSupportStats() {
  const { data } = await api.get<{ stats: SupportTicketStats }>('/support/stats');
  return data;
}

export async function listSupportTickets(status?: SupportTicketStatus) {
  const { data } = await api.get<{ tickets: SupportTicketSummary[] }>('/support/tickets', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getSupportTicket(threadId: string) {
  const { data } = await api.get<{
    ticket: SupportTicketSummary;
    messages: SupportTicketMessage[];
    can_reply: boolean;
  }>(`/support/tickets/${threadId}`);
  return data;
}

export async function replySupportTicket(
  threadId: string,
  body: { content: string; attachmentKeys?: string[] }
) {
  const { data } = await api.post<{ message: SupportTicketMessage }>(
    `/support/tickets/${threadId}/messages`,
    body
  );
  return data;
}

export async function resolveSupportTicket(threadId: string) {
  const { data } = await api.post<{ ticket: SupportTicketSummary }>(
    `/support/tickets/${threadId}/resolve`
  );
  return data;
}

export async function getAgentHelpRequests() {
  const { data } = await api.get('/agents/help-requests');
  return data;
}

export async function resolveAgentHelpRequest(requestId: string) {
  const { data } = await api.post(`/agents/help-requests/${requestId}/resolve`);
  return data;
}

export async function getAgentDashboard() {
  const { data } = await api.get('/agents/dashboard');
  return data;
}

export async function getAgentTasks() {
  const { data } = await api.get('/agents/tasks');
  return data;
}

export async function createAgentPersonalTask(body: {
  name: string;
  description?: string;
  due_date: string;
  priority?: string;
  assigned_farmers?: string[];
  reminder_type?: string;
}) {
  const { data } = await api.post('/agents/tasks', body);
  return data;
}

export async function updateAgentPersonalTask(
  taskId: string,
  body: {
    status?: string;
    name?: string;
    description?: string | null;
    due_date?: string;
    priority?: string;
  }
) {
  const { data } = await api.patch(`/agents/tasks/${taskId}`, body);
  return data;
}

export async function getAgentPersonalTask(taskId: string) {
  const { data } = await api.get(`/agents/tasks/${taskId}`);
  return data;
}

export async function setAgentTaskReminder(taskId: string, reminder_type: string) {
  const { data } = await api.post(`/agents/tasks/${taskId}/reminder`, { reminder_type });
  return data;
}

/** Field agent approves farmer evidence on an agent-assigned (personal) task. */
export async function approveAgentPersonalTask(taskId: string, notes?: string) {
  const { data } = await api.post(`/agents/tasks/${taskId}/approve`, notes ? { notes } : {});
  return data;
}

/** Field agent rejects farmer evidence on an agent-assigned (personal) task. */
export async function rejectAgentPersonalTask(taskId: string, rejection_reason: string) {
  const { data } = await api.post(`/agents/tasks/${taskId}/reject`, { rejection_reason });
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

export async function updateFarmerProfilePhoto(picture_url: string) {
  const { data } = await api.patch('/farmer/profile/photo', { picture_url });
  return data;
}

export async function getFarmerProjects() {
  const { data } = await api.get('/farmer/projects');
  return data;
}

export async function getFarmerPayments() {
  const { data } = await api.get('/farmer/payments');
  return data as {
    payments: Array<{
      id: string;
      project_name: string;
      amount: number;
      payment_status: string;
      payment_method: string;
      created_at: string;
      mpesa_reference?: string;
      description?: string;
      is_expected?: boolean;
    }>;
    summary?: {
      transferred: number;
      pending: number;
      expected: number;
      total: number;
    };
  };
}

export async function claimPayment(paymentId: string) {
  const { data } = await api.post(`/farmer/payments/${paymentId}/claim`);
  return data;
}

export async function getFarmerNotifications() {
  const { data } = await api.get('/farmer/notifications');
  return data;
}

// Messaging & notifications (unified API)
export type MessageThreadRow = {
  id: string;
  title?: string | null;
  context_type?: string | null;
  support_status?: string | null;
  other_user_name: string;
  last_message_content: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export async function getMessageThreads(search?: string) {
  const { data } = await api.get('/messages/threads', {
    params: search ? { search } : undefined,
  });
  return data as { threads: MessageThreadRow[] };
}

export async function getMessageContacts() {
  const { data } = await api.get('/messages/contacts');
  return data as { contacts: Array<{ userId: string; name: string; role: string }> };
}

export async function startMessageThread(recipientId: string, title?: string) {
  const { data } = await api.post('/messages/threads', { recipientId, title });
  return data as { threadId: string };
}

export async function getThreadMessages(threadId: string) {
  const { data } = await api.get(`/messages/threads/${threadId}`);
  return data as {
    messages: Array<{
      id: string;
      content: string;
      created_at: string;
      sender_name?: string;
      is_mine?: boolean;
      attachment_url?: string | null;
    }>;
    otherUser: { id: string; name: string } | null;
    title?: string | null;
    context_type?: string | null;
    support_status?: string | null;
  };
}

export async function sendThreadMessage(threadId: string, content: string) {
  const { data } = await api.post(`/messages/threads/${threadId}/messages`, { content });
  return data;
}

export async function getUnreadMessageCount() {
  const { data } = await api.get('/messages/unread-count');
  return data as { count: number };
}

export async function getAppNotifications(unreadOnly = false) {
  const { data } = await api.get('/notifications', {
    params: unreadOnly ? { unread: 'true' } : undefined,
  });
  return data as {
    notifications: Array<{
      id: string;
      title: string;
      message: string;
      type: string;
      is_read: boolean;
      created_at: string;
      context_type?: string | null;
      context_id?: string | null;
      action_url?: string | null;
    }>;
  };
}

export async function getUnreadNotificationCount() {
  const { data } = await api.get('/notifications/unread-count');
  return data as { count: number };
}

export async function markNotificationRead(notificationId: string) {
  const { data } = await api.post(`/notifications/${notificationId}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post('/notifications/read-all');
  return data;
}

export async function getNotificationSettings() {
  const { data } = await api.get('/notifications/settings');
  return data as { settings: Record<string, boolean | string | null> };
}

export async function updateNotificationSettings(patch: Record<string, boolean | string | null>) {
  const { data } = await api.patch('/notifications/settings', patch);
  return data as { settings: Record<string, boolean | string | null> };
}

// Phase 2 hierarchy
// Phase 2 hierarchy — admin CRUD
export async function getAdminSectors() {
  const { data } = await api.get('/admin/sectors');
  return data;
}

export async function createAdminSector(body: { name: string; description?: string; country?: string }) {
  const { data } = await api.post('/admin/sectors', body);
  return data;
}

export async function updateAdminSector(id: string, body: { name?: string; description?: string; country?: string }) {
  const { data } = await api.put(`/admin/sectors/${id}`, body);
  return data;
}

export async function deleteAdminSector(id: string) {
  const { data } = await api.delete(`/admin/sectors/${id}`);
  return data;
}

export async function getAdminPrograms(sectorId?: string) {
  const { data } = await api.get('/admin/programs', { params: sectorId ? { sector_id: sectorId } : {} });
  return data;
}

export async function createAdminProgram(body: { name: string; sector_id: string; description?: string; budget_kes?: number }) {
  const { data } = await api.post('/admin/programs', body);
  return data;
}

export async function updateAdminProgram(id: string, body: Record<string, unknown>) {
  const { data } = await api.put(`/admin/programs/${id}`, body);
  return data;
}

export async function deleteAdminProgram(id: string) {
  const { data } = await api.delete(`/admin/programs/${id}`);
  return data;
}

export async function getAdminProjects(programId?: string) {
  const { data } = await api.get('/admin/projects', { params: programId ? { program_id: programId } : {} });
  return data;
}

export async function createAdminProject(body: Record<string, unknown>) {
  const { data } = await api.post('/admin/projects', body);
  return data;
}

export async function updateAdminProject(id: string, body: Record<string, unknown>) {
  const { data } = await api.put(`/admin/projects/${id}`, body);
  return data;
}

export async function deleteAdminProject(id: string) {
  const { data } = await api.delete(`/admin/projects/${id}`);
  return data;
}

export async function getAdminProjectTasks(projectId: string) {
  const { data } = await api.get(`/admin/projects/${projectId}/tasks`);
  return data;
}

export async function createAdminProjectTask(projectId: string, body: Record<string, unknown>) {
  const { data } = await api.post(`/admin/projects/${projectId}/tasks`, body);
  return data;
}

export async function updateAdminProjectTask(taskId: string, body: Record<string, unknown>) {
  const { data } = await api.put(`/admin/tasks/${taskId}`, body);
  return data;
}

export async function deleteAdminProjectTask(taskId: string) {
  const { data } = await api.delete(`/admin/tasks/${taskId}`);
  return data;
}

export async function reorderAdminProjectTask(taskId: string, direction: 'up' | 'down') {
  const { data } = await api.post(`/admin/tasks/${taskId}/reorder`, { direction });
  return data;
}

export async function getAdminProjectFarmers(projectId: string) {
  const { data } = await api.get(`/admin/projects/${projectId}/farmers`);
  return data;
}

export async function assignAdminProjectFarmers(projectId: string, farmerIds: string[], taskIds?: string[]) {
  const { data } = await api.post(`/admin/projects/${projectId}/farmers`, { farmer_ids: farmerIds, task_ids: taskIds });
  return data;
}

export async function removeAdminProjectFarmer(projectId: string, farmerId: string) {
  const { data } = await api.delete(`/admin/projects/${projectId}/farmers/${farmerId}`);
  return data;
}

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

export async function getAdminFarmerTasks(params?: {
  program_project_id?: string;
  status?: string;
  farmer_id?: string;
}) {
  const { data } = await api.get('/admin/farmer-tasks', { params });
  return data;
}

export async function getAdminFarmerTask(farmerTaskId: string) {
  const { data } = await api.get(`/admin/farmer-tasks/${farmerTaskId}`);
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

export async function getFarmerHierarchyTasks(params?: {
  status?: string;
  program_project_id?: string;
  outstanding?: string;
}) {
  const { data } = await api.get('/farmer/hierarchy/tasks', { params });
  return data;
}

/** Spec alias: GET /api/farmer/tasks?project_id=X */
export async function getFarmerProjectTasks(projectId: string, status?: string) {
  const { data } = await api.get('/farmer/tasks', {
    params: { project_id: projectId, status },
  });
  return data;
}

export async function getFarmerHierarchyTask(farmerTaskId: string) {
  const { data } = await api.get(`/farmer/hierarchy/tasks/${farmerTaskId}`);
  return data;
}

/** GET /api/farmer/tasks/:id — accepts farmer_tasks.id or program task template id. */
export async function getFarmerPortalTask(taskRef: string) {
  const { data } = await api.get(`/farmer/tasks/${taskRef}`);
  return data;
}

export async function getFarmerTaskApprovalStatus(farmerTaskId: string) {
  const { data } = await api.get(`/farmer/tasks/${farmerTaskId}/approval-status`);
  return data;
}

/** Spec alias: GET /api/farmer/tasks/:task_id/status */
export async function getFarmerTaskStatus(farmerTaskId: string) {
  const { data } = await api.get(`/farmer/tasks/${farmerTaskId}/status`);
  return data;
}

/** Spec alias: POST /api/farmer/tasks/:id/submit-completion */
export async function submitFarmerTaskCompletion(
  farmerTaskId: string,
  body: { photo_url?: string; notes?: string }
) {
  const { data } = await api.post(`/farmer/tasks/${farmerTaskId}/submit-completion`, body);
  return data;
}

export async function submitFarmerHierarchyTask(farmerTaskId: string, body: { photo_url?: string; notes?: string }) {
  const { data } = await api.post(`/farmer/hierarchy/tasks/${farmerTaskId}/submit`, body);
  return data;
}

/** Farmer submits evidence on a field-agent-assigned agent_tasks row. */
export async function submitAgentAssignedTask(
  taskId: string,
  body: { photo_url?: string; notes?: string }
) {
  const { data } = await api.post(`/farmer/agent-tasks/${taskId}/submit`, body);
  return data;
}

export async function getFarmerAgentAssignedTask(taskId: string) {
  const { data } = await api.get(`/farmer/agent-tasks/${taskId}`);
  return data;
}

/** Farmer recalls a hierarchy submission (status → in-progress, evidence kept). */
export async function recallFarmerHierarchyTask(farmerTaskId: string) {
  const { data } = await api.post(`/farmer/hierarchy/tasks/${farmerTaskId}/recall`);
  return data;
}

/** Spec alias: POST /api/farmer/tasks/:id/recall */
export async function recallFarmerTaskCompletion(farmerTaskId: string) {
  const { data } = await api.post(`/farmer/tasks/${farmerTaskId}/recall`);
  return data;
}

/** Farmer recalls an agent-assigned submission (status → in_progress, evidence kept). */
export async function recallAgentAssignedTask(taskId: string) {
  const { data } = await api.post(`/farmer/agent-tasks/${taskId}/recall`);
  return data;
}

/** Farmer starts a hierarchy task (not-started → in-progress + farmer_started_at). */
export async function startFarmerHierarchyTask(
  farmerTaskId: string,
  body: { start_date: string }
) {
  const { data } = await api.post(`/farmer/hierarchy/tasks/${farmerTaskId}/start`, body);
  return data;
}

/** Spec alias: POST /api/farmer/tasks/:id/start */
export async function startFarmerTaskCompletion(
  farmerTaskId: string,
  body: { start_date: string }
) {
  const { data } = await api.post(`/farmer/tasks/${farmerTaskId}/start`, body);
  return data;
}

/** Farmer starts an agent-assigned task (not-started → in-progress + farmer_started_at). */
export async function startAgentAssignedTask(
  taskId: string,
  body: { start_date: string }
) {
  const { data } = await api.post(`/farmer/agent-tasks/${taskId}/start`, body);
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

/** View-only: aggregation centres in the logged-in agent's district. */
export async function getAgentCentresInDistrict(): Promise<{
  centres: Array<{ centre_id: string; name: string; location: string }>;
}> {
  const { data } = await api.get('/aggregation/centres/in-district');
  return data;
}

export async function getCentreInventory(centreId?: string, status?: string) {
  const path = centreId ? `/aggregation/centre/${centreId}/inventory` : '/aggregation/centre/inventory';
  const { data } = await api.get(path, { params: status ? { status } : {} });
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
  const { data } = await api.post('/aggregation-centres/deliveries', {
    ...body,
    centre_id: centreId === 'self' ? undefined : centreId,
  });
  return data;
}

export async function approveInventoryQuality(inventoryId: string, body: {
  quality_status: 'approved' | 'rejected';
  quality_notes?: string;
  marketplace_price_per_unit?: number;
  price_per_unit_applied?: number;
}) {
  const { data } = await api.patch(`/aggregation-centres/deliveries/${inventoryId}/quality-check`, {
    quality_status: body.quality_status,
    quality_notes: body.quality_notes,
    price_per_unit_applied: body.price_per_unit_applied ?? body.marketplace_price_per_unit,
  });
  return data;
}

/** Single inventory/delivery row for offline QC conflict checks. */
export async function getCentreInventoryItem(inventoryId: string) {
  const { data } = await api.get(`/aggregation-centres/deliveries/${inventoryId}`);
  return data;
}

/** Bank MVP — pending QC deliveries at a centre (centre_inventory with quality_status = pending). */
export async function getPendingQcDeliveries(centreId: string) {
  const { data } = await api.get(`/aggregation-centres/${centreId}/deliveries`);
  return data;
}

export async function getAggregationCentres() {
  const { data } = await api.get('/aggregation/centres');
  return data;
}

/** Fetch aggregation centres for registration dropdown by farmer location. */
export async function fetchAggregationCentresByLocation(params: {
  country: string;
  county: string;
  subcounty?: string;
}) {
  const { data } = await api.get('/aggregation-centres', {
    params: {
      country: params.country,
      county: params.county,
      subcounty: params.subcounty,
    },
  });
  return data as {
    centres: Array<{
      id: string;
      centre_id: string;
      name: string;
      country: string;
      county: string;
      subcounty?: string;
      location?: string;
    }>;
  };
}

export async function verifyFarmerField(
  farmerId: string,
  verification_status: 'verified' | 'rejected',
  verification_notes?: string
) {
  const { data } = await api.patch(`/farmers/${farmerId}/verify`, {
    verification_status,
    verification_notes,
  });
  return data;
}

export async function getPendingDeliveries(centreId?: string) {
  const path = centreId
    ? `/aggregation/centre/${centreId}/pending-deliveries`
    : '/aggregation/centre/pending-deliveries';
  const { data } = await api.get(path);
  return data;
}

export async function aggregationCentreLogin(body: { centre_id: string; phone_number: string; password: string }) {
  const { data } = await api.post('/aggregation/login', body);
  return data;
}

export async function approveCentreQuality(_centreId: string | undefined, body: {
  inventory_id: string;
  quality_notes: string;
  marketplace_price_per_unit: number;
}) {
  return approveInventoryQuality(body.inventory_id, {
    quality_status: 'approved',
    quality_notes: body.quality_notes,
    price_per_unit_applied: body.marketplace_price_per_unit,
  });
}

/** Bank MVP — verify national ID against farmers.id_number_hash. */
export async function verifyFarmerId(id_number: string, farmer_id?: string) {
  const { data } = await api.post('/banking/verify-farmer-id', { id_number, farmer_id });
  return data as {
    verified: boolean;
    farmer_id?: string;
    name?: string;
    phone_number?: string;
  };
}
