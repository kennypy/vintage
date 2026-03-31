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
                t.isIdentifier(nodePath.node.object.property, { name: 'env' })
              ) {
                const propName = nodePath.node.property.name;
                if (propName === 'EXPO_ROUTER_APP_ROOT') {
                  const filename = state.filename || state.file.opts.filename;
                  if (filename) {
                    const rel = path
                      .relative(path.dirname(filename), APP_DIR)
                      .replace(/\\/g, '/');
                    nodePath.replaceWith(t.stringLiteral(rel));
                  }
                } else if (propName === 'EXPO_ROUTER_IMPORT_MODE') {
                  nodePath.replaceWith(t.stringLiteral('sync'));
                }
              }
            },
          },
        };
      },
      // react-native-reanimated plugin MUST be listed last.
      // Skip in test environment — react-native-worklets (its peer dep in v4)
      // is not installed as a dev dependency and the plugin is not needed for
      // Jest unit tests.
      ...(process.env.NODE_ENV !== 'test' ? ['react-native-reanimated/plugin'] : []),
    ],
  };
};
