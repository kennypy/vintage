const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

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
