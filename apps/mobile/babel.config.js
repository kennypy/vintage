const path = require('path');

// Absolute path to the app directory — used to compute the relative path
// that expo-router's _ctx files need as the first arg to require.context().
const APP_DIR = path.join(__dirname, 'app');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // babel-preset-expo's expoRouterBabelPlugin skips EXPO_ROUTER_APP_ROOT
      // substitution when NODE_ENV === 'test'. In monorepos on Windows this can
      // be set in the system environment even during a dev bundling run, causing
      // Metro to throw "First argument of require.context should be a string".
      // This plugin does the substitution unconditionally, before the preset runs.
      function expoRouterAppRootPlugin({ types: t }) {
        return {
          name: 'expo-router-app-root',
          visitor: {
            MemberExpression(nodePath, state) {
              if (
                t.isMemberExpression(nodePath.node.object) &&
                t.isIdentifier(nodePath.node.object.object, { name: 'process' }) &&
                t.isIdentifier(nodePath.node.object.property, { name: 'env' }) &&
                t.isIdentifier(nodePath.node.property, { name: 'EXPO_ROUTER_APP_ROOT' })
              ) {
                const filename = state.filename || state.file.opts.filename;
                if (filename) {
                  // Compute path relative to the file being transformed, then
                  // normalise to forward slashes so require.context works on Windows.
                  const rel = path
                    .relative(path.dirname(filename), APP_DIR)
                    .replace(/\\/g, '/');
                  nodePath.replaceWith(t.stringLiteral(rel));
                }
              }
            },
          },
        };
      },
      // react-native-reanimated plugin MUST be listed last
      'react-native-reanimated/plugin',
    ],
  };
};
