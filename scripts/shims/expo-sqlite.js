/** expo-sqlite stub — proof uses the web AsyncStorage outbox, not SQLite. */
module.exports = {
  openDatabaseAsync: async () => {
    throw new Error('expo-sqlite is not available in the Node outbox proof harness');
  },
};
