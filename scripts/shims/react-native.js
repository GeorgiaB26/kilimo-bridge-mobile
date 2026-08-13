/** Minimal react-native shim for Node outbox e2e proofs. */
const appStateListeners = new Set();
let appStateStatus = 'active';

const AppState = {
  get currentState() {
    return appStateStatus;
  },
  addEventListener(_type, listener) {
    appStateListeners.add(listener);
    return {
      remove() {
        appStateListeners.delete(listener);
      },
    };
  },
  /** Test helper */
  __setState(next) {
    const prev = appStateStatus;
    appStateStatus = next;
    for (const listener of appStateListeners) {
      try {
        listener(next);
      } catch {
        /* ignore */
      }
    }
    return prev;
  },
  __reset() {
    appStateListeners.clear();
    appStateStatus = 'active';
  },
};

module.exports = {
  Platform: {
    OS: 'web',
    select: (spec) => (spec && (spec.web ?? spec.default)),
  },
  AppState,
  Alert: {
    alert: (title, message) => {
      console.log(`[Alert] ${title}: ${message}`);
    },
  },
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s) => s },
};
