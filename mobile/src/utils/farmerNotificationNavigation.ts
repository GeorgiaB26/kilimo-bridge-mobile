import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export type FarmerNotification = {
  id: string;
  type: string;
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

function contextId(notification: FarmerNotification): string | undefined {
  return (
    notification.context_id ??
    notification.related_id ??
    undefined
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
    root.navigate('MessagesFlow', {
      screen: contextIdValue ? 'MessageDetail' : 'MessagesList',
      params: contextIdValue ? { threadId: contextIdValue } : undefined,
    });
    return;
  }

  if (
    type.includes('payment') ||
    contextType === 'payment' ||
    type === 'payment_ready' ||
    type === 'payment_processed'
  ) {
    root.navigate('MainTabs', {
      screen: 'Payments',
      params: contextIdValue ? { highlightPaymentId: contextIdValue } : undefined,
    });
    return;
  }

  if (
    type.includes('project') ||
    contextType === 'project' ||
    contextType === 'program_project' ||
    type === 'project_assigned'
  ) {
    if (contextIdValue) {
      root.navigate('MainTabs', {
        screen: 'Projects',
        params: {
          screen: 'HierarchyProjectDetail',
          params: { projectId: contextIdValue, projectName: 'Your project' },
        },
      });
    } else {
      root.navigate('MainTabs', { screen: 'Projects' });
    }
    return;
  }

  if (
    type.includes('task') ||
    contextType === 'task' ||
    type === 'task_assigned'
  ) {
    root.navigate('MainTabs', { screen: 'Tasks' });
    return;
  }

  if (
    type.includes('verification') ||
    type.includes('registration') ||
    type === 'help_request_resolved'
  ) {
    root.navigate('MainTabs', { screen: 'Profile' });
    return;
  }

  if (type.includes('help')) {
    root.navigate('MainTabs', { screen: 'Profile' });
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
  const contextIdValue = contextId(notification);
  const root = getRootNavigation(navigation);

  const isMessage =
    type === 'message' ||
    type === 'message_received' ||
    type.includes('message') ||
    contextType === 'message' ||
    contextType === 'message_thread';

  if (isMessage) {
    root.navigate('MessagesFlow', {
      screen: contextIdValue ? 'MessageDetail' : 'MessagesList',
      params: contextIdValue ? { threadId: contextIdValue } : undefined,
    });
    return;
  }

  if (type.includes('task') || contextType === 'task' || type === 'task_assigned') {
    root.navigate('MainTabs', { screen: 'Tasks' });
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
    root.navigate('MainTabs', { screen: 'Profile' });
    return;
  }

  if (type.includes('farmer')) {
    root.navigate('MainTabs', { screen: 'Farmers' });
    return;
  }

  root.navigate('MainTabs', { screen: 'Dashboard' });
}
