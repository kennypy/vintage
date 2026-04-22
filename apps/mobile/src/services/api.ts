import { secureGet, secureSet, secureDelete } from './secureStorage';
import { isDemoModeSync } from './demoStore';

const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_DEV = process.env.EXPO_PUBLIC_ENV !== 'production';

if (!ENV_API_URL && !IS_DEV) {
  // Fail loudly in production builds — a localhost fallback would ship a broken app.
  throw new Error(
    'EXPO_PUBLIC_API_URL must be set in production builds. Check your EAS build profile env.',
  );
}

const API_BASE_URL = ENV_API_URL ?? 'http://localhost:3001/api/v1';

// Defence in depth: even if EXPO_PUBLIC_ENV is somehow tampered with
// at build time (eg. a wrong EAS profile), refuse to ship a build
// that talks to the API over plaintext HTTP. Production traffic carries
// JWTs + PII + payment intents — every byte must be on TLS.
if (!IS_DEV && API_BASE_URL.startsWith('http://')) {
  throw new Error(
    'Production builds must use https:// for EXPO_PUBLIC_API_URL. Cleartext API URLs would expose tokens and payment data.',
  );
}

const TOKEN_KEY = 'vintage_access_token';
const REFRESH_KEY = 'vintage_refresh_token';

export async function getToken(): Promise<string | null> {
  return secureGet(TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await secureSet(TOKEN_KEY, accessToken);
  await secureSet(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await secureDelete(TOKEN_KEY);
  await secureDelete(REFRESH_KEY);
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

const FETCH_TIMEOUT_MS = 10000;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF token cache. Server TTL is 7 days (see CsrfMiddleware:
// CSRF_TOKEN_TTL_MS). Cache conservatively for 23h to stay well
// inside that window even if the app stays resident across a
// daylight-savings roll and to guarantee a rotation per calendar
// day. Rotation also happens eagerly on a 403-CSRF response (see
// invalidateCsrfToken below), so the worst-case wait is one retry.
let csrfTokenCache: string | null = null;
let csrfTokenFetchedAt = 0;
const CSRF_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

export async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache && Date.now() - csrfTokenFetchedAt < CSRF_CACHE_TTL_MS) {
    return csrfTokenCache;
  }
  // Same timeout posture as apiFetch — a hung server here used to
  // freeze every mutating call in the app indefinitely because the
  // CSRF fetch is awaited from inside apiFetch with no upper bound.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/csrf-token`, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Falha ao obter token CSRF: timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error('Falha ao obter token CSRF');
  const data = (await res.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  csrfTokenFetchedAt = Date.now();
  return csrfTokenCache;
}

/** Force a new CSRF token on the next call — used after a 403 CSRF rejection. */
export function invalidateCsrfToken(): void {
  csrfTokenCache = null;
  csrfTokenFetchedAt = 0;
}

/**
 * Revoke the current refresh token on the server. The /auth/logout
 * endpoint hashes the presented token and marks the matching
 * RefreshToken row revoked. Critically, the REFRESH token (not the
 * access token) must be the one presented — refresh tokens are opaque
 * random strings tracked server-side, while access tokens are stateless
 * JWTs that never land in the RefreshToken table. apiFetch() always
 * attaches the access token, which would be a silent no-op here; this
 * helper does a bare fetch with the refresh token in Authorization so
 * the revoke actually takes effect.
 *
 * Best-effort: swallows network / server errors so the local signout
 * flow always completes. Also clears the CSRF cache because server-side
 * state has changed.
 */
export async function revokeRefreshTokenOnServer(): Promise<void> {
  const refreshToken = await secureGet(REFRESH_KEY);
  if (!refreshToken) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
      signal: controller.signal,
    });
  } catch {
    /* best-effort — a stolen local copy of the refresh token is the
       real concern, not a transient network failure */
  } finally {
    clearTimeout(timeoutId);
  }
  invalidateCsrfToken();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // In demo mode there is no API — fail immediately so fallbacks trigger without delay
  if (isDemoModeSync()) {
    throw new TypeError('Demo mode — no API available');
  }

  const { authenticated = true, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (authenticated) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Attach CSRF token for all state-changing requests
  if (!SAFE_METHODS.has(options.method?.toUpperCase() ?? 'GET')) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      signal: controller.signal,
      ...rest,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError or network error — rethrow as TypeError so callers fall back to demo
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TypeError('Request timed out', { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && authenticated) {
    // Attempt token refresh
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const newToken = await getToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
      try {
        const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
          headers,
          signal: retryController.signal,
          ...rest,
        });
        clearTimeout(retryTimeout);
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, await safeParseError(retryResponse));
        }
        return retryResponse.json();
      } catch (err) {
        clearTimeout(retryTimeout);
        throw err;
      }
    }
    throw new ApiError(401, 'Session expired');
  }

  // On CSRF rejection, rotate the token and retry once. The server rotates
  // tokens every 24 h and on some state transitions; without this retry the
  // user sees a spurious failure.
  if (
    response.status === 403
    && !SAFE_METHODS.has(options.method?.toUpperCase() ?? 'GET')
  ) {
    let bodyText = '';
    try { bodyText = await response.clone().text(); } catch { /* ignore */ }
    if (bodyText.toLowerCase().includes('csrf')) {
      invalidateCsrfToken();
      headers['X-CSRF-Token'] = await getCsrfToken();
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
      try {
        const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
          headers,
          signal: retryController.signal,
          ...rest,
        });
        clearTimeout(retryTimeout);
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, await safeParseError(retryResponse));
        }
        return retryResponse.json();
      } catch (err) {
        clearTimeout(retryTimeout);
        throw err;
      }
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await safeParseError(response));
  }

  return response.json();
}

// Single-flight guard. When several screens re-fetch at once (e.g. the
// user returns to the app after a sleep and three tabs simultaneously
// hit 401), each apiFetch would otherwise call attemptRefresh()
// independently. The first call rotates the refresh token server-side;
// every subsequent call then POSTs an already-revoked token and fails,
// so the user is logged out despite having a valid session moments ago.
// Collapsing concurrent callers onto one in-flight promise preserves the
// retry semantics without racing the rotation.
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    try {
      const refreshToken = await secureGet(REFRESH_KEY);
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      });

      if (!response.ok) return false;

      const data = await response.json();
      await setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function safeParseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message ?? 'Erro desconhecido';
  } catch {
    return 'Erro de conexão';
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
