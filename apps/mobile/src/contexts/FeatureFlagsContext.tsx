import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { fetchFeatureFlags, getCachedFlags } from '../services/featureFlags';
import { isDemoModeSync } from '../services/demoStore';

interface FeatureFlagsContextValue {
  flags: Record<string, boolean>;
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: {},
  isLoaded: false,
  refresh: async () => {},
});

export function FeatureFlagsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    // In demo mode, all features are available
    if (isDemoModeSync()) {
      setIsLoaded(true);
      return;
    }

    const result = await fetchFeatureFlags();
    setFlags(result);
    setIsLoaded(true);
    lastFetchRef.current = Date.now();
  }, []);

  // Initial load: use cache first, then fetch
  useEffect(() => {
    (async () => {
      const cached = await getCachedFlags();
      if (Object.keys(cached).length > 0) {
        setFlags(cached);
        setIsLoaded(true);
      }
      await refresh();
    })();
  }, [refresh]);

  // Refresh when app comes to foreground (with 5-min debounce)
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        const elapsed = Date.now() - lastFetchRef.current;
        if (elapsed > 5 * 60 * 1000) {
          refresh();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, isLoaded, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Returns true if the feature is enabled.
 * In demo mode, always returns true.
 * If the flag doesn't exist, returns false.
 */
export function useFeatureFlag(key: string): boolean {
  const { flags } = useContext(FeatureFlagsContext);

  // In demo mode, everything is available
  if (isDemoModeSync()) return true;

  return flags[key] ?? false;
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext);
}
