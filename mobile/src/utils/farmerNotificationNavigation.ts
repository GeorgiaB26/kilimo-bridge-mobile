import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export type FarmerNotification = {
  id: string;
  type: string;
  context_type?: string | null;
  context_id?: string | null;
  action_url?: string | null;
};

function findNavigatorWithRoute(
  navigation: NavigationProp<ParamListBase>,
  routeName: string
): NavigationProp<ParamListBase> | null {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  while (nav) {
    if (nav.getState().routeNames.includes(routeName)) {
      return nav;
    }
    nav = nav.getParent() as NavigationProp<ParamListBase> | undefined;
  }
  return null;
}

/** Navigate from a notification tap to the related farmer screen. */
export function navigateFromFarmerNotification(
  navigation: NavigationProp<ParamListBase>,
  notification: FarmerNotification
): void {
  const type = notification.type.toLowerCase();
  const contextId = notification.context_id ?? undefined;
  const contextType = (notification.context_type ?? '').toLowerCase();

  const mainTabs = findNavigatorWithRoute(navigation, 'MainTabs');
  if (!mainTabs) return;

  if (type === 'message_received' || contextType === 'message_thread') {
    const messagesNav = findNavigatorWithRoute(navigation, 'MessagesFlow');
    if (messagesNav && contextId) {
      messagesNav.navigate('MessagesFlow', {
        screen: 'MessageDetail',
        params: { threadId: contextId },
      });
    } else if (messagesNav) {
      messagesNav.navigate('MessagesFlow');
    }
    return;
  }

  if (
    type.includes('payment') ||
    contextType === 'payment' ||
    type === 'payment_ready' ||
    type === 'payment_processed'
  ) {
    mainTabs.navigate('MainTabs', {
      screen: 'Payments',
      params: { highlightPaymentId: contextId },
    });
    return;
  }

  if (
    type.includes('project') ||
    contextType === 'project' ||
    contextType === 'program_project' ||
    type === 'project_assigned'
  ) {
    if (contextId) {
      mainTabs.navigate('MainTabs', {
        screen: 'Projects',
        params: {
          screen: 'HierarchyProjectDetail',
          params: { projectId: contextId, projectName: 'Your project' },
        },
      });
    } else {
      mainTabs.navigate('MainTabs', { screen: 'Projects' });
    }
    return;
  }

  if (
    type.includes('task') ||
    contextType === 'task' ||
    type === 'task_assigned'
  ) {
    if (contextId) {
      mainTabs.navigate('MainTabs', {
        screen: 'Projects',
        params: {
          screen: 'HierarchyProjectDetail',
          params: { projectId: contextId, projectName: 'Your tasks' },
        },
      });
    } else {
      mainTabs.navigate('MainTabs', { screen: 'Projects' });
    }
    return;
  }

  if (
    type.includes('verification') ||
    type.includes('registration') ||
    type === 'help_request_resolved'
  ) {
    mainTabs.navigate('MainTabs', { screen: 'Profile' });
    return;
  }

  if (type.includes('help')) {
    mainTabs.navigate('MainTabs', { screen: 'Profile' });
  }
}
