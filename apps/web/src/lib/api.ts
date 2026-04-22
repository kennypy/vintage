// NEXT_PUBLIC_API_URL is inlined by Next at build time. If it is missing
// the build still succeeds — the fallback below keeps local dev working
// without any env setup — but shipping a production build that silently
// points at localhost turns the entire site into a null-response wasteland
// (every API call is a connection-refused in the user's browser).
//
// Match the mobile client's posture in apps/mobile/src/services/api.ts:
//  • missing in non-prod → use the localhost default
//  • missing in prod     → throw (fail the build before it ships)
//  • http:// in prod     → throw (tokens and payment intents must be TLS)
//
// NODE_ENV is set to "production" by `next build` during the build step,
// so this check runs at build time; if it ever runs at request time (e.g.
// in a server component) the same logic still applies.
const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL;
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !ENV_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL must be set for production web builds. A localhost fallback would ship a broken app.',
  );
}
if (IS_PROD && ENV_API_URL && ENV_API_URL.startsWith('http://')) {
  throw new Error(
    'NEXT_PUBLIC_API_URL must use https:// in production. Cleartext would expose session cookies and CSRF tokens.',
  );
}

const API_URL = ENV_API_URL ?? 'http://localhost:3001/api/v1';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  isFormData?: boolean;
}

// ── Session storage ──────────────────────────────────────────────────────────
//
// The web client used to read/write the JWT in localStorage and send it via
// `Authorization: Bearer`. localStorage is XSS-stealable: any compromised
// dependency, third-party widget, or unsanitised innerHTML inside the app
// could exfiltrate the token. We've migrated to HttpOnly + Secure +
// SameSite=Strict cookies set by the API on /auth/login, /auth/register,
// /auth/refresh, /auth/2fa/confirm-login and the social-login endpoints.
//
// As a result, the web client no longer touches the token at all — the
// browser sends it automatically thanks to `credentials: 'include'`, and
// the response cookie is invisible to JavaScript (HttpOnly).
//
// setAuthToken / clearAuthToken below are kept as no-ops so existing call
// sites compile without churning every page in the same commit. They will
// be removed in a follow-up cleanup once every page stops calling them.

// ── CSRF token cache ──────────────────────────────────────────────────────────
let _csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  try {
    const res = await fetch(`${API_URL}/auth/csrf-token`, {
      // Same credentials posture as the rest of the client so a future
      // session-bound CSRF rotation lands on the right session.
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json() as { csrfToken: string };
      _csrfToken = data.csrfToken;
      return _csrfToken;
    }
  } catch {
    // fall through — use empty string; server will reject if strictly required
  }
  return '';
}

// ── Core request helper ───────────────────────────────────────────────────────
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Hit /auth/refresh using the HttpOnly vintage_refresh cookie the server
 * scopes to that exact path. The browser attaches it automatically when
 * we opt into `credentials: 'include'`; the API rotates the session
 * cookie (and the refresh cookie) in its response, so subsequent calls
 * transparently use the new access token.
 *
 * Single-flight: concurrent 401s across the app collapse onto one
 * network roundtrip. Without this, a page that fires three fetches in
 * parallel would trigger three /auth/refresh posts — the first rotates
 * the refresh token, the other two POST an already-revoked token and
 * evict the user despite having a valid session a moment earlier.
 *
 * Best-effort: any failure (network, 401 from expired refresh, 5xx)
 * returns false and the caller surfaces the original 401 to the UI.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      // On success the server rotated the session cookie — subsequent
      // requests will pick up the new access token automatically.
      // Also invalidate the cached CSRF token: its lifetime is tied to
      // the session, and the simplest safe thing is a refresh.
      if (res.ok) {
        _csrfToken = null;
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (!options.isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  // Authorization header intentionally absent. The session lives in an
  // HttpOnly cookie set by the API; the browser sends it automatically
  // when we opt in to `credentials: 'include'`. JavaScript can't read it,
  // so XSS in the web app cannot exfiltrate the JWT.

  if (MUTATING_METHODS.has(method)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    // Send + accept cookies (the session, refresh, and CSRF cookies all
    // live here). Same-origin / same-site only thanks to SameSite=Strict
    // on the API's Set-Cookie header.
    credentials: 'include',
    body: options.isFormData
      ? (options.body as FormData)
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });

  if (!response.ok) {
    // Access cookie expired — try refresh once and replay the request.
    // JWT_EXPIRY defaults to 15 min on the server; without this branch
    // every page older than that emits a 401 and bounces the user to
    // /auth/login even though their 7-day refresh cookie is still
    // valid. Cookies are managed by the browser so we don't need to
    // thread tokens through — fetch() picks up the new session cookie
    // the refresh endpoint wrote on its Set-Cookie response.
    if (response.status === 401) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        // Mutating requests need a fresh CSRF token after refresh
        // (attemptRefresh invalidated the cache above).
        if (MUTATING_METHODS.has(method)) {
          headers['X-CSRF-Token'] = await getCsrfToken();
        }
        const retry = await fetch(`${API_URL}${path}`, {
          method,
          headers,
          credentials: 'include',
          body: options.isFormData
            ? (options.body as FormData)
            : options.body
              ? JSON.stringify(options.body)
              : undefined,
        });
        if (retry.ok) {
          return retry.json() as Promise<T>;
        }
        const retryBody = await retry.text().catch(() => '');
        throw new Error(`API Error ${retry.status}: ${retryBody.slice(0, 200)}`);
      }
      // Refresh failed — fall through to the generic error path below
      // so the UI can route to /auth/login.
    }
    // CSRF token may have expired — clear cache and retry once
    if (response.status === 403 && MUTATING_METHODS.has(method)) {
      _csrfToken = null;
      headers['X-CSRF-Token'] = await getCsrfToken();
      const retry = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        credentials: 'include',
        body: options.isFormData
          ? (options.body as FormData)
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
      });
      if (retry.ok) {
        return retry.json() as Promise<T>;
      }
      const retryBody = await retry.text().catch(() => '');
      throw new Error(`API Error ${retry.status}: ${retryBody.slice(0, 200)}`);
    }

    const errorBody = await response.text().catch(() => '');
    throw new Error(`API Error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return request<T>('GET', path, { headers });
}

export function apiPost<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return request<T>('POST', path, { body, headers });
}

export function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>('POST', path, { body: formData, isFormData: true });
}

export function apiPut<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return request<T>('PUT', path, { body, headers });
}

export function apiPatch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return request<T>('PATCH', path, { body, headers });
}

export function apiDelete<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  // Accepts an optional body so DELETE /users/me can carry the
  // LGPD delete-account payload (password + reason). No-body DELETEs
  // (unfollow, unblock, remove listing) call with the single-arg
  // form and pass body=undefined.
  return request<T>('DELETE', path, { body, headers });
}

/**
 * Token storage moved to HttpOnly cookies set by the API after login;
 * the web client never touches the JWT directly anymore. We still write
 * a non-secret presence marker to localStorage ("1") because layouts
 * across /conta, /admin, /sell, etc. read this key to decide whether
 * to render account-scoped chrome or redirect to /auth/login. The
 * marker is NOT a credential — every API call is authenticated by the
 * HttpOnly cookie, so leaking the marker is harmless.
 */
export function setAuthToken(_token: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('vintage_token', '1');
    } catch {
      /* private mode / storage disabled — server-side cookie still works */
    }
    // `storage` events only fire on OTHER tabs, so Header can't see a
    // same-tab login via that channel. Emit a custom event so any
    // component subscribed to auth-state changes can react immediately.
    window.dispatchEvent(new Event('vintage-auth-change'));
  }
}

/**
 * POSTs /auth/logout so the API clears the session + refresh cookies,
 * then sweeps any stale localStorage token. Mobile keeps using its own
 * local clearTokens flow.
 */
export async function clearAuthToken(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': await getCsrfToken() },
    });
  } catch {
    /* server-side cookie clear best-effort — local cleanup still runs */
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('vintage_token');
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('vintage-auth-change'));
  }
}
