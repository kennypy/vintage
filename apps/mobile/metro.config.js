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

// Intercept react and react-native imports to guarantee they always resolve
// to the correct runtime packages in apps/mobile/node_modules, not to stale
// root-level copies or @types/* stubs.
//
// We must intercept BOTH the exact package name AND all subpath imports
// (e.g. react-native/Libraries/WebSocket/WebSocket) because packages hoisted
// to the workspace root (like @expo/metro-runtime) would otherwise traverse up
// from their own location and find root/node_modules/react-native@0.76.6 or
// root/node_modules/react@18.3.1 for subpath imports, bypassing nodeModulesPaths.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Exact 'react' import → react@19.1.0/index.js
  if (moduleName === 'react') {
    const pkg = require(path.join(reactDir, 'package.json'));
    return {
      filePath: path.resolve(reactDir, pkg.main || 'index.js'),
      type: 'sourceFile',
    };
  }
  // 'react/*' subpath imports (e.g. react/jsx-runtime) → anchor to react@19.1.0
  if (moduleName.startsWith('react/')) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(reactDir, 'index.js') },
      moduleName,
      platform,
    );
  }
  // Exact 'react-native' import → react-native@0.81.5/index.js
  if (moduleName === 'react-native') {
    const pkg = require(path.join(reactNativeDir, 'package.json'));
    return {
      filePath: path.resolve(reactNativeDir, pkg.main || 'index.js'),
      type: 'sourceFile',
    };
  }
  // 'react-native/*' subpath imports (e.g. react-native/Libraries/WebSocket/WebSocket)
  // → anchor to react-native@0.81.5 so packages hoisted to workspace root
  //   don't accidentally load files from the stale 0.76.6 copy.
  if (moduleName.startsWith('react-native/')) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(reactNativeDir, 'index.js') },
      moduleName,
      platform,
    );
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
