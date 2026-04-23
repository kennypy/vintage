const path = require('path');
const fs = require('fs');

// jest-expo is optional - if not installed, use a basic preset
let preset = {};
try {
  preset = require('jest-expo/jest-preset');
} catch (e) {
  // jest-expo not available, use basic react-native preset
  preset = {
    testEnvironment: 'node',
    moduleNameMapper: {},
    setupFiles: [],
  };
}

// jest-expo's withTypescriptMapping reads tsconfig paths and converts them to
// moduleNameMapper. Our tsconfig maps "react" to local @types/react for type
// resolution (to avoid dual @types/react@18 vs @19 conflict in the monorepo),
// but this should NOT affect Jest's runtime module resolution.
const cleanedMapper = { ...(preset.moduleNameMapper || {}) };
for (const key of Object.keys(cleanedMapper)) {
  if (typeof cleanedMapper[key] === 'string' && cleanedMapper[key].includes('@types')) {
    delete cleanedMapper[key];
  }
}

// Resolve React to mobile's local copy to avoid version mismatch between
// React 19 (mobile) and React 18 (root/web). Falls back to standard resolution
// if the local copy doesn't exist (e.g. fully hoisted installs).
const localReact = path.resolve(__dirname, 'node_modules/react');
const localRenderer = path.resolve(__dirname, 'node_modules/react-test-renderer');
const reactMapper = {};
if (fs.existsSync(localReact)) {
  reactMapper['^react$'] = localReact;
  reactMapper['^react/(.*)$'] = localReact + '/$1';
}
if (fs.existsSync(localRenderer)) {
  reactMapper['^react-test-renderer$'] = localRenderer;
  reactMapper['^react-test-renderer/(.*)$'] = localRenderer + '/$1';
}

// Mock expo modules for tests when unavailable
const expoDeviceMock = path.resolve(__dirname, 'src/__mocks__/expo-device.js');
const expoConstantsMock = path.resolve(__dirname, 'src/__mocks__/expo-constants.js');
const expoMocks = {};
if (fs.existsSync(expoDeviceMock)) {
  expoMocks['^expo-device$'] = expoDeviceMock;
}
if (fs.existsSync(expoConstantsMock)) {
  expoMocks['^expo-constants$'] = expoConstantsMock;
}

module.exports = {
  ...preset,
  setupFiles: [
    require.resolve('./jest.setup.js'),
    ...(preset.setupFiles || []),
  ],
  moduleNameMapper: {
    ...cleanedMapper,
    ...reactMapper,
    ...expoMocks,
  },
  // react-native is not hoisted to the monorepo root. When expo (hoisted to root
  // node_modules) imports react-native/* sub-paths, Jest needs to resolve them
  // from the mobile workspace's local node_modules.
  modulePaths: [path.resolve(__dirname, 'node_modules')],
};
