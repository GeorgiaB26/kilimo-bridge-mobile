/**
 * Shared fetchLive helpers for offline read-cache keys.
 * Used by screens today and by warmReadCachesForCurrentUser (step 3) —
 * keep this module free of React / screen imports.
 */

import {
  api,
  getAgentDashboard,
  getAgentTasks,
  getFarmerAssignedTasks,
  getFarmerDashboard,
  getFarmerHierarchyProjects,
  getFarmerPayments,
  getFarmerProjectTasks,
  getMessageThreads,
} from '../api/client';

export async function fetchFarmerDashboardForCache() {
  const dashboard = await getFarmerDashboard();
  let recentTasks = dashboard.recentTasks ?? dashboard.assignedTasks ?? [];
  if (!recentTasks.length) {
    try {
      const tasksRes = await getFarmerAssignedTasks();
      recentTasks = (tasksRes.tasks ?? []).slice(0, 3);
    } catch {
      /* keep dashboard-only data */
    }
  }
  return { ...dashboard, recentTasks };
}

export async function fetchFarmerProjectsForCache() {
  return getFarmerHierarchyProjects();
}

export async function fetchFarmerPaymentsForCache() {
  return getFarmerPayments();
}

export async function fetchFarmerProjectTasksForCache(programProjectId: string) {
  return getFarmerProjectTasks(programProjectId);
}

export async function fetchAgentFarmersForCache(): Promise<{
  farmers?: Array<{
    farmer_id: string;
    name: string;
    phone_number: string;
    district: string;
    status: string;
  }>;
}> {
  const { data } = await api.get('/agents/farmers');
  return data;
}

export async function fetchAgentDashboardForCache() {
  return getAgentDashboard();
}

export async function fetchAgentTasksForCache() {
  return getAgentTasks();
}

export async function fetchMessageThreadsForCache() {
  const data = await getMessageThreads();
  return { threads: data.threads ?? [] };
}
