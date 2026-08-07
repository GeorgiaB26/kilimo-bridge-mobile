/** expo-file-system stub — unused when Platform.OS === 'web' + base64 photos. */
module.exports = {
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: async () => {
    throw new Error('expo-file-system readAsStringAsync not available in Node harness');
  },
};
