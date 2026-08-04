/** Minimal react-native shim for Node outbox e2e proofs. */
module.exports = {
  Platform: {
    OS: 'web',
    select: (spec) => (spec && (spec.web ?? spec.default)),
  },
  Alert: {
    alert: (title, message) => {
      console.log(`[Alert] ${title}: ${message}`);
    },
  },
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s) => s },
};
