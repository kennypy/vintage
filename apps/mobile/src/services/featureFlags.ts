import * as SecureStore from 'expo-secure-store';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const CACHE_KEY = 'vintage_feature_flags';

interface FeatureFlagResponse {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

interface CachedFlags {
  flags: Record<string, boolean>;
  fetchedAt: number;
}

export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE_URL}/feature-flags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) as FeatureFlagResponse[];

    const flags: Record<string, boolean> = {};
    for (const flag of data) {
      flags[flag.key] = flag.enabled;
    }

    const cached: CachedFlags = { flags, fetchedAt: Date.now() };
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(cached));

    return flags;
  } catch {
    // On network error, fall back to cache
    return getCachedFlags();
  }
}

export async function getCachedFlags(): Promise<Record<string, boolean>> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedFlags;
      return cached.flags;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}
