const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  isFormData?: boolean;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vintage_token');
}

// ── CSRF token cache ──────────────────────────────────────────────────────────
let _csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  try {
    const res = await fetch(`${API_URL}/auth/csrf-token`);
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
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (!options.isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (MUTATING_METHODS.has(method)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
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

export function apiDelete<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return request<T>('DELETE', path, { headers });
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vintage_token', token);
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('vintage_token');
  }
}
