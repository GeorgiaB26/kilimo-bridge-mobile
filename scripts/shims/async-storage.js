/** In-memory AsyncStorage for Node outbox e2e proofs. */
const store = new Map();

const AsyncStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, String(value));
  },
  async removeItem(key) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async multiRemove(keys) {
    for (const key of keys) store.delete(key);
  },
  async getAllKeys() {
    return [...store.keys()];
  },
  /** Test helper — not part of real AsyncStorage API. */
  __dump() {
    return Object.fromEntries(store.entries());
  },
  __reset() {
    store.clear();
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
