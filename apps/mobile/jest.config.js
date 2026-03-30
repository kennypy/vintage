const path = require('path');
const preset = require('jest-expo/jest-preset');

// jest-expo's withTypescriptMapping reads tsconfig paths and converts them to
// moduleNameMapper. Our tsconfig maps "react" and "react-native" for type
// resolution, but these should NOT affect Jest's runtime module resolution.
const cleanedMapper = { ...(preset.moduleNameMapper || {}) };
for (const key of Object.keys(cleanedMapper)) {
  if (typeof cleanedMapper[key] === 'string' && cleanedMapper[key].includes('@types')) {
    delete cleanedMapper[key];
  }
}

module.exports = {
  ...preset,
  setupFiles: [
    require.resolve('./jest.setup.js'),
    ...(preset.setupFiles || []),
  ],
  moduleNameMapper: {
    ...cleanedMapper,
    // Force all modules to use the same React instance (mobile's local copy)
    // to avoid version mismatches between React 19 (mobile) and React 18 (root).
    '^react$': path.resolve(__dirname, 'node_modules/react'),
    '^react/(.*)$': path.resolve(__dirname, 'node_modules/react/$1'),
    '^react-test-renderer$': path.resolve(__dirname, 'node_modules/react-test-renderer'),
    '^react-test-renderer/(.*)$': path.resolve(__dirname, 'node_modules/react-test-renderer/$1'),
  },
};
