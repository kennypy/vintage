const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// In a monorepo Metro's transform workers may not inherit EXPO_ROUTER_APP_ROOT
// from the Expo CLI process. Set it here so babel-preset-expo can substitute
// the literal path into expo-router's require.context() call at transform time.
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, 'app');
}

const config = getDefaultConfig(projectRoot);

// Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from resolving duplicate React copies from nested node_modules
// (exclusionList was removed in metro-config v5; blockList accepts RegExps directly)
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/react\/.*/,
  /node_modules\/.*\/node_modules\/react-native\/.*/,
];

// Explicitly resolve react and react-native to the workspace root copies.
// This prevents Metro from accidentally resolving `react` to `@types/react`
// when the actual react package is hoisted to the monorepo root.
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

module.exports = config;
