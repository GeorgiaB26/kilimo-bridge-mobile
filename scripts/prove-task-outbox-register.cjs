/**
 * Register Node require hooks so mobile outbox code can run outside Expo.
 * Must be required before any mobile/src imports.
 */
const Module = require('module');
const path = require('path');

const shimDir = path.join(__dirname, 'shims');
const mobileServices = path.join(__dirname, '..', 'mobile', 'src', 'services');
const webOutbox = path.join(mobileServices, 'offlineOutbox.web.ts');

const aliases = {
  'react-native': path.join(shimDir, 'react-native.js'),
  '@react-native-async-storage/async-storage': path.join(shimDir, 'async-storage.js'),
  'expo-sqlite': path.join(shimDir, 'expo-sqlite.js'),
  'expo-file-system': path.join(shimDir, 'expo-file-system.js'),
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(aliases, request)) {
    return aliases[request];
  }

  // Force web outbox (AsyncStorage) instead of native expo-sqlite implementation.
  if (
    (request === './offlineOutbox' || request === '../services/offlineOutbox') &&
    parent?.filename &&
    parent.filename.includes(`${path.sep}mobile${path.sep}src${path.sep}`)
  ) {
    return webOutbox;
  }

  return originalResolve.call(this, request, parent, isMain, options);
};
