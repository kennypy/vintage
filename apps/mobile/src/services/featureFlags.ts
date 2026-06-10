import { secureGet, secureSet } from './secureStorage';

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

// Re-fetch flags from the server every 24h even on cache hits. Without a TTL
// a user who launches the app once, gets flags cached, and stays online but
// never opens the screen that triggers a refresh would keep the original
// flag values for the lifetime of the app install — so a backend flag flip
// (e.g. enabling MERCADOPAGO_PAYOUT) would never reach the device.
const FEATURE_FLAGS_TTL_MS = 24 * 60 * 60 * 1000;

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
    await secureSet(CACHE_KEY, JSON.stringify(cached));

    return flags;
  } catch {
    // On network error, fall back to cache
    return getCachedFlags();
  }
}

export async function getCachedFlags(): Promise<Record<string, boolean>> {
  try {
    const raw = await secureGet(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedFlags;
      return cached.flags;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

/**
 * Returns cached flags if they are still fresh. Used by the boot path to
 * decide between an immediate render off the cache vs awaiting a fetch.
 * Anything older than FEATURE_FLAGS_TTL_MS triggers a refetch by the caller.
 */
export async function getFreshCachedFlags(): Promise<Record<string, boolean> | null> {
  try {
    const raw = await secureGet(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedFlags;
    if (typeof cached.fetchedAt !== 'number') return null;
    if (Date.now() - cached.fetchedAt > FEATURE_FLAGS_TTL_MS) return null;
    return cached.flags;
  } catch {
    return null;
  }
}
