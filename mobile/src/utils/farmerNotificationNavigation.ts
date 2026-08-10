import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';

export type FarmerNotification = {
  id: string;
  type: string;
  title?: string;
  message?: string;
  context_type?: string | null;
  context_id?: string | null;
  action_url?: string | null;
  notification_type?: string | null;
  related_id?: string | null;
};

function getRootNavigation(
  navigation: NavigationProp<ParamListBase>
): NavigationProp<ParamListBase> {
  let current: NavigationProp<ParamListBase> = navigation;
  let parent = navigation.getParent();
  while (parent) {
    current = parent;
    parent = current.getParent();
  }
  return current;
}

function notificationType(notification: FarmerNotification): string {
  const raw =
    notification.type ||
    notification.notification_type ||
    notification.context_type ||
    '';
  return raw.toLowerCase();
}

function contextIdFromActionUrl(actionUrl?: string | null): string | undefined {
  if (!actionUrl?.trim()) return undefined;
  const match = actionUrl.trim().match(/\/tasks\/([^/?#]+)/i);
  return match?.[1];
}

function contextId(notification: FarmerNotification): string | undefined {
  return (
    notification.context_id ??
    notification.related_id ??
    contextIdFromActionUrl(notification.action_url) ??
    undefined
  );
}

function isTaskQcOrRejectedNotification(notification: FarmerNotification): boolean {
  const type = notificationType(notification);
  const title = (notification.title ?? '').toLowerCase();
  return (
    type === 'task_qc_failed' ||
    type === 'task_rejected' ||
    type.includes('rejected') ||
    (type === 'error' && title.includes('qc'))
  );
}

function navigateMainTab(
  root: NavigationProp<ParamListBase>,
  screen: string,
  params?: Record<string, unknown>
): void {
  root.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: {
        screen,
        params,
      },
    })
  );
}

function navigateToFarmerTask(
  root: NavigationProp<ParamListBase>,
  notification: FarmerNotification,
  contextIdValue: string | undefined
): void {
  const type = notificationType(notification);
  const qcOrRejected = isTaskQcOrRejectedNotification(notification);
  const params: Record<string, unknown> = {};

  if (contextIdValue) {
    params.taskId = contextIdValue;
    params.highlightTaskId = contextIdValue;
    if (qcOrRejected) {
      params.openSubmitModal = true;
      params.fromNotification = true;
      params.statusFilter = 'rejected';
    }
  }

  navigateMainTab(
    root,
    'Tasks',
    Object.keys(params).length > 0 ? params : undefined
  );
}

/** Navigate from a notification tap to the related screen (farmer or field agent app). */
export function navigateFromFarmerNotification(
  navigation: NavigationProp<ParamListBase>,
  notification: FarmerNotification
): void {
  const type = notificationType(notification);
  const contextType = (notification.context_type ?? '').toLowerCase();
  const contextIdValue = contextId(notification);
  const root = getRootNavigation(navigation);

  const isMessage =
    type === 'message' ||
    type === 'message_received' ||
    type.includes('message') ||
    contextType === 'message' ||
    contextType === 'message_thread';

  if (isMessage) {
    root.dispatch(
      CommonActions.navigate({
        name: 'MessagesFlow',
        params: {
          screen: contextIdValue ? 'MessageDetail' : 'MessagesList',
          params: contextIdValue ? { threadId: contextIdValue } : undefined,
        },
      })
    );
    return;
  }

  if (
    type.includes('payment') ||
    contextType === 'payment' ||
    type === 'payment_ready' ||
    type === 'payment_processed'
  ) {
    navigateMainTab(root, 'Payments', contextIdValue ? { highlightPaymentId: contextIdValue } : undefined);
    return;
  }

  if (
    type.includes('project') ||
    contextType === 'project' ||
    contextType === 'program_project' ||
    type === 'project_assigned'
  ) {
    if (contextIdValue) {
      navigateMainTab(root, 'Projects', {
        screen: 'HierarchyProjectDetail',
        params: { projectId: contextIdValue, projectName: 'Your project' },
      });
    } else {
      navigateMainTab(root, 'Projects');
    }
    return;
  }

  if (
    type.includes('task') ||
    contextType === 'task' ||
    contextType === 'agent_task' ||
    contextType === 'farmer_task' ||
    type === 'task_assigned' ||
    isTaskQcOrRejectedNotification(notification)
  ) {
    navigateToFarmerTask(root, notification, contextIdValue);
    return;
  }

  if (
    type.includes('verification') ||
    type.includes('registration') ||
    type === 'help_request_resolved'
  ) {
    navigateMainTab(root, 'Profile');
    return;
  }

  if (type.includes('help')) {
    navigateMainTab(root, 'Profile');
  }
}

/** Agent app: payments/projects tabs may be missing — fall back to Profile/Dashboard. */
export function navigateFromNotification(
  navigation: NavigationProp<ParamListBase>,
  notification: FarmerNotification,
  options?: { isAgent?: boolean }
): void {
  if (!options?.isAgent) {
    navigateFromFarmerNotification(navigation, notification);
    return;
  }

  const type = notificationType(notification);
  const contextType = (notification.context_type ?? '').toLowerCase();
  const root = getRootNavigation(navigation);

  const isMessage =
    type === 'message' ||
    type === 'message_received' ||
    type.includes('message') ||
    contextType === 'message' ||
    contextType === 'message_thread';

  if (isMessage) {
    root.dispatch(
      CommonActions.navigate({
        name: 'MessagesFlow',
        params: {
          screen: contextId(notification) ? 'MessageDetail' : 'MessagesList',
          params: contextId(notification) ? { threadId: contextId(notification) } : undefined,
        },
      })
    );
    return;
  }

  if (
    type.includes('task') ||
    contextType === 'task' ||
    contextType === 'agent_task' ||
    contextType === 'farmer_task' ||
    type === 'task_assigned'
  ) {
    const taskId = contextId(notification);
    navigateMainTab(
      root,
      'Tasks',
      taskId ? { filter: 'all', taskId, highlightTaskId: taskId } : { filter: 'all' }
    );
    return;
  }

  if (
    type.includes('payment') ||
    contextType === 'payment' ||
    type.includes('verification') ||
    type.includes('registration') ||
    type.includes('help') ||
    type === 'help_request_resolved'
  ) {
    navigateMainTab(root, 'Profile');
    return;
  }

  if (type.includes('farmer')) {
    navigateMainTab(root, 'Farmers', { screen: 'FarmerList' });
    return;
  }

  navigateMainTab(root, 'Dashboard');
}
