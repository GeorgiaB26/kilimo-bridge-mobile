/**
 * In-memory NetInfo shim for Node outbox reconnect proofs.
 * Supports addEventListener / fetch and test-driven state changes.
 */
const listeners = new Set();

let currentState = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: null,
};

function notify() {
  for (const listener of listeners) {
    try {
      listener(currentState);
    } catch {
      /* ignore */
    }
  }
}

const NetInfo = {
  addEventListener(listener) {
    listeners.add(listener);
    // Real NetInfo also fires immediately with current state
    listener(currentState);
    return () => {
      listeners.delete(listener);
    };
  },
  async fetch() {
    return currentState;
  },
  /** Test helper */
  __setState(partial) {
    currentState = { ...currentState, ...partial };
    notify();
  },
  __reset() {
    listeners.clear();
    currentState = {
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
      details: null,
    };
  },
};

module.exports = NetInfo;
module.exports.default = NetInfo;
