const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(monorepoRoot, 'shared');
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Only watch shared/ — watching the whole monorepo root pulls backend/etc into
// Metro's haste map and can crash with DependencyGraph._onHasteChange.
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  '@kilimo-bridge/shared': sharedRoot,
  // NativeWind's babel jsxImportSource rewrites Expo source to import these;
  // pin them so Metro can resolve from nested node_modules packages (e.g. expo).
  nativewind: path.resolve(mobileNodeModules, 'nativewind'),
  'react-native-css-interop': path.resolve(mobileNodeModules, 'react-native-css-interop'),
};

module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
