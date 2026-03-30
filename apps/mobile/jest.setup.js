// Set up the React Native bridge config and TurboModule proxy before jest-expo runs.
// React Native 0.79 requires these globals for native module access in tests.

if (!global.__fbBatchedBridgeConfig) {
  global.__fbBatchedBridgeConfig = {
    remoteModuleConfig: [],
    localModulesConfig: [],
  };
}

// Provide a TurboModule proxy that returns stub modules for any native module.
// React Native 0.79 uses TurboModuleRegistry.getEnforcing() extensively, which
// throws if the module is null. This proxy returns a Proxy object that handles
// any property access gracefully.
if (!global.__turboModuleProxy) {
  const knownModules = {
    SourceCode: {
      getConstants: () => ({
        scriptURL: 'http://localhost:8081/index.bundle',
      }),
      scriptURL: 'http://localhost:8081/index.bundle',
    },
    PlatformConstants: {
      getConstants: () => ({
        isTesting: true,
        reactNativeVersion: { major: 0, minor: 79, patch: 2 },
        forceTouchAvailable: false,
        osVersion: 17,
        systemName: 'iOS',
        interfaceIdiom: 'phone',
      }),
    },
    DeviceInfo: {
      getConstants: () => ({
        Dimensions: {
          window: { width: 375, height: 812, scale: 3, fontScale: 1 },
          screen: { width: 375, height: 812, scale: 3, fontScale: 1 },
        },
      }),
    },
  };

  function createGenericNativeModuleMock() {
    return new Proxy(
      { getConstants: () => ({}) },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (prop === 'addListener' || prop === 'removeListeners') return () => {};
          if (typeof prop === 'string' && prop.startsWith('get')) return () => ({});
          if (typeof prop === 'symbol') return undefined;
          return () => {};
        },
      },
    );
  }

  global.__turboModuleProxy = (name) =>
    knownModules[name] || createGenericNativeModuleMock();
}
