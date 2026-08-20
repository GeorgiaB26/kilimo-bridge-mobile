import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { SUPPORT_TICKET_CONTEXT } from '../../shared/src/supportDesk';

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
  const url = actionUrl.trim();
  const patterns = [
    /\/support\/tickets\/([^/?#]+)/i,
    /\/messages\/([^/?#]+)/i,
    /\/tasks\/([^/?#]+)/i,
    /\/farmers\/([^/?#]+)/i,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match?.[1]) return match[1];
  }
  return undefined;
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

function isSupportTicketNotification(notification: FarmerNotification): boolean {
  const type = notificationType(notification);
  const title = (notification.title ?? '').toLowerCase();
  const contextType = (notification.context_type ?? '').toLowerCase();
  const url = (notification.action_url ?? '').toLowerCase();
  return (
    contextType === SUPPORT_TICKET_CONTEXT ||
    contextType === 'support_ticket' ||
    type.includes('support_ticket') ||
    type.includes('support') ||
    url.includes('/support/tickets/') ||
    title.includes('support ticket') ||
    title.includes('support replied')
  );
}

/** Resolve support ticket thread id from context or `/support/tickets/:id` action_url. */
export function supportThreadIdFromNotification(
  notification: FarmerNotification
): string | undefined {
  const url = notification.action_url ?? '';
  const fromUrl = /\/support\/tickets\/([^/?#]+)/i.exec(url)?.[1];
  const id = contextId(notification);
  if (!isSupportTicketNotification(notification) && !fromUrl) {
    return undefined;
  }
  return id ?? fromUrl;
}

/** Walk parents until a navigator actually owns this route, then navigate there. */
function navigateToRoute(
  start: NavigationProp<ParamListBase>,
  routeName: string,
  params?: object
): boolean {
  let nav: NavigationProp<ParamListBase> | undefined = start;
  while (nav) {
    const names = nav.getState()?.routeNames ?? [];
    if (names.includes(routeName)) {
      if (params) {
        nav.dispatch(CommonActions.navigate({ name: routeName, params }));
      } else {
        nav.navigate(routeName);
      }
      return true;
    }
    nav = nav.getParent();
  }
  return false;
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

/** Open the farmer task detail screen (same module as notification taps). */
export function openFarmerTaskModule(
  navigation: NavigationProp<ParamListBase>,
  taskId: string,
  opts?: { fromNotification?: boolean; openSubmitModal?: boolean }
): boolean {
  return navigateToRoute(navigation, 'TaskDetail', {
    taskId,
    fromNotification: opts?.fromNotification === true,
    openSubmitModal: opts?.openSubmitModal === true,
  });
}

function navigateToFarmerTask(
  root: NavigationProp<ParamListBase>,
  notification: FarmerNotification,
  contextIdValue: string | undefined
): void {
  if (contextIdValue) {
    openFarmerTaskModule(root, contextIdValue, {
      fromNotification: true,
      openSubmitModal: isTaskQcOrRejectedNotification(notification),
    });
    return;
  }

  const qcOrRejected = isTaskQcOrRejectedNotification(notification);
  const params: Record<string, unknown> = {};
  if (qcOrRejected) {
    params.statusFilter = 'rejected';
  }
  navigateMainTab(
    root,
    'Tasks',
    Object.keys(params).length > 0 ? params : undefined
  );
}

function navigateSupportTicketThread(
  navigation: NavigationProp<ParamListBase>,
  notification: FarmerNotification,
  options?: { isSupportDesk?: boolean }
): void {
  const threadId = supportThreadIdFromNotification(notification);
  const type = notificationType(notification);
  const resolved = type.includes('resolved');

  if (options?.isSupportDesk) {
    if (threadId) {
      navigateToRoute(navigation, 'MainTabs', {
        screen: 'Messages',
        params: {
          screen: 'SupportTicketDetail',
          params: {
            threadId,
            status: resolved ? 'resolved' : 'open',
          },
          initial: false,
        },
      });
      return;
    }
    navigateToRoute(navigation, 'MainTabs', {
      screen: 'Messages',
      params: {
        screen: 'SupportTicketsList',
        params: { statusFilter: resolved ? 'resolved' : 'open' },
        initial: false,
      },
    });
    return;
  }

  if (threadId) {
    const detailParams = {
      threadId,
      contextType: SUPPORT_TICKET_CONTEXT,
      supportStatus: resolved ? 'resolved' : 'open',
    };
    const opened = navigateToRoute(navigation, 'MessagesFlow', {
      screen: 'MessageDetail',
      params: detailParams,
      initial: false,
    });
    if (!opened) {
      navigateToRoute(navigation, 'MessageDetail', detailParams);
    }
    return;
  }

  navigateToRoute(navigation, 'MessagesFlow', { screen: 'MessagesList' });
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

  if (isSupportTicketNotification(notification)) {
    navigateSupportTicketThread(navigation, notification);
    return;
  }

  const isMessage =
    type === 'message' ||
    type === 'message_received' ||
    type.includes('message') ||
    contextType === 'message' ||
    contextType === 'message_thread';

  if (isMessage) {
    navigateToRoute(navigation, 'MessagesFlow', {
      screen: contextIdValue ? 'MessageDetail' : 'MessagesList',
      params: contextIdValue ? { threadId: contextIdValue } : undefined,
      initial: false,
    });
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
    type === 'task_rejected' ||
    type === 'task_qc_failed' ||
    type === 'task_approved' ||
    isTaskQcOrRejectedNotification(notification)
  ) {
    navigateToFarmerTask(root, notification, contextIdValue);
    return;
  }

  if (
    type.includes('verification') ||
    type.includes('registration') ||
    type.includes('photo') ||
    type === 'help_request_resolved'
  ) {
    navigateMainTab(root, 'Profile');
    return;
  }

  if (type.includes('help')) {
    navigateMainTab(root, 'Profile');
  }
}

/** Agent / support-desk apps: payments/projects tabs may be missing — fall back appropriately. */
export function navigateFromNotification(
  navigation: NavigationProp<ParamListBase>,
  notification: FarmerNotification,
  options?: { isAgent?: boolean; isSupportDesk?: boolean }
): void {
  if (options?.isSupportDesk) {
    const root = getRootNavigation(navigation);
    if (isSupportTicketNotification(notification)) {
      navigateSupportTicketThread(navigation, notification, { isSupportDesk: true });
      return;
    }
    navigateMainTab(root, 'Messages', {
      screen: 'SupportTicketsList',
      params: { statusFilter: 'open' },
    });
    return;
  }

  if (!options?.isAgent) {
    navigateFromFarmerNotification(navigation, notification);
    return;
  }

  const type = notificationType(notification);
  const contextType = (notification.context_type ?? '').toLowerCase();
  const root = getRootNavigation(navigation);

  if (isSupportTicketNotification(notification)) {
    navigateSupportTicketThread(navigation, notification);
    return;
  }

  const isMessage =
    type === 'message' ||
    type === 'message_received' ||
    type.includes('message') ||
    contextType === 'message' ||
    contextType === 'message_thread';

  if (isMessage) {
    const threadId = contextId(notification);
    navigateToRoute(navigation, 'MessagesFlow', {
      screen: threadId ? 'MessageDetail' : 'MessagesList',
      params: threadId ? { threadId } : undefined,
      initial: false,
    });
    return;
  }

  if (
    type.includes('task') ||
    contextType === 'task' ||
    contextType === 'agent_task' ||
    contextType === 'farmer_task' ||
    type === 'task_assigned'
  ) {
    const id = contextId(notification);
    navigateMainTab(
      root,
      'Tasks',
      id
        ? { filter: 'all', taskId: id, highlightTaskId: id }
        : { filter: 'all' }
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

  if (type === 'farmer_photo_update' || contextType === 'farmer') {
    const id = contextId(notification);
    if (id) {
      navigateMainTab(root, 'Farmers', {
        screen: 'FarmerProfile',
        params: { farmerId: id, name: notification.title || 'Farmer' },
      });
      return;
    }
    navigateMainTab(root, 'Farmers', { screen: 'FarmerList' });
    return;
  }

  if (type.includes('farmer')) {
    navigateMainTab(root, 'Farmers', { screen: 'FarmerList' });
    return;
  }

  navigateMainTab(root, 'Dashboard');
}
