const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Set EXPO_ROUTER_APP_ROOT for monorepo setups where Metro workers
// may not inherit it from the Expo CLI process environment.
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

// Resolve the real react / react-native package directories at config load
// time, preferring the mobile-local copy first (e.g. react@19 vs root react@18).
function resolvePackageDir(name) {
  try {
    return path.dirname(
      require.resolve(`${name}/package.json`, { paths: [projectRoot] })
    );
  } catch (_) {
    return path.resolve(workspaceRoot, 'node_modules', name);
  }
}
const reactDir = resolvePackageDir('react');
const reactNativeDir = resolvePackageDir('react-native');

// Intercept 'react' and 'react-native' imports to guarantee they always
// resolve to the correct runtime package, not to @types/* stubs.
// This fixes the "While trying to resolve react … @types/react was found"
// error that occurs in a monorepo on Windows when Metro's exports-field
// resolution falls back unexpectedly.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react') {
    const pkg = require(path.join(reactDir, 'package.json'));
    return {
      filePath: path.resolve(reactDir, pkg.main || 'index.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-native') {
    const pkg = require(path.join(reactNativeDir, 'package.json'));
    return {
      filePath: path.resolve(reactNativeDir, pkg.main || 'index.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Block duplicate React copies that may exist inside nested node_modules
// (e.g. a dependency that ships its own react copy).
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/react\/.*/,
  /node_modules\/.*\/node_modules\/react-native\/.*/,
];

// Also register as extraNodeModules as a secondary safety net.
config.resolver.extraNodeModules = {
  react: reactDir,
  'react-native': reactNativeDir,
};

module.exports = config;
