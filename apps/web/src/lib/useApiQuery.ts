'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';

// Why this hook exists:
//
// Pages across /orders, /messages, /favorites, /addresses, /offers,
// /returns, /listings, /notifications, /price-alerts, /saved-searches,
// /profile and ~15 others all had this pattern:
//
//   apiGet('/endpoint')
//     .then((res) => setItems(Array.isArray(res) ? res : (res.data ?? [])))
//     .catch(() => setItems([]))        // <-- bug: error becomes empty state
//     .finally(() => setLoading(false));
//
// Three problems, all hit in production:
//   1. Error is indistinguishable from "legitimate zero results". User sees
//      "Você ainda não..." when the API actually 500'd.
//   2. Response-shape unwrap is reinvented everywhere with different
//      fallback orders (some try .data, some try .items, some neither).
//      The API's pagination shape changes → N pages break silently.
//   3. The "check localStorage('vintage_token') in a useEffect and push to
//      login" boilerplate is duplicated 26 times across pages.
//
// useApiQuery gives every page the same three-state shape — loading /
// error / data — so the UI can render each case deliberately. The token
// redirect and 401 handling are centralised.

export type UseApiQueryResult<T> = {
  data: T | null;
  loading: boolean;
  /** null when no error. A human-readable string taken from Error.message
   *  when possible, otherwise a generic Portuguese fallback. */
  error: string | null;
  /** Trigger a fresh fetch. Returns the same state that the hook exposes. */
  refetch: () => Promise<void>;
};

export type UseApiQueryOptions<T, R = T> = {
  /** When true, redirect to /auth/login if no vintage_token presence marker
   *  exists in localStorage before even firing the request. Default: false. */
  requireAuth?: boolean;

  /** When true (default), a 401 response from the API redirects to
   *  /auth/login. Set to false for endpoints that optionally work
   *  unauthenticated (e.g. the public listings feed). */
  redirectOn401?: boolean;

  /** Transform the raw response to the desired shape. Lets callers unwrap
   *  { items: T[] } / { data: T[] } / arrays without bespoke logic. */
  transform?: (raw: R) => T;

  /** Skip the fetch entirely when false. Useful for conditional loads
   *  (e.g. don't fetch /orders/:id until the id param is defined). */
  enabled?: boolean;
};

/**
 * Unwraps the common paginated-list shapes the API returns:
 *   - T[]                       → T[]
 *   - { items: T[], ... }       → T[]
 *   - { data: T[], ... }        → T[]
 *   - anything else             → []
 *
 * Use as `transform: unwrapList<Order>` in useApiQuery options.
 */
export function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const r = raw as { items?: unknown; data?: unknown };
    if (Array.isArray(r.items)) return r.items as T[];
    if (Array.isArray(r.data)) return r.data as T[];
  }
  return [];
}

export function useApiQuery<T, R = unknown>(
  path: string | null,
  opts: UseApiQueryOptions<T, R> = {},
): UseApiQueryResult<T> {
  const {
    requireAuth = false,
    redirectOn401 = true,
    transform,
    enabled = true,
  } = opts;
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path) && enabled);
  const [error, setError] = useState<string | null>(null);

  // Guards against state updates after unmount (e.g. after a fast
  // route change). Without this, a late-arriving fetch result warns
  // in React and can resurrect state in a stale component.
  const mountedRef = useRef(true);

  // Stable reference to the latest transform so changing the transform
  // function identity across renders doesn't re-trigger the fetch.
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const fetchOnce = useCallback(async () => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }
    if (requireAuth && typeof window !== 'undefined') {
      const hasSession = !!localStorage.getItem('vintage_token');
      if (!hasSession) {
        router.push('/auth/login');
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await apiGet<R>(path);
      if (!mountedRef.current) return;
      const t = transformRef.current;
      setData(t ? t(raw) : (raw as unknown as T));
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível carregar os dados. Tente novamente.';
      if (redirectOn401 && /\b401\b/.test(msg)) {
        router.push('/auth/login');
        return;
      }
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [path, requireAuth, redirectOn401, enabled, router]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce]);

  return { data, loading, error, refetch: fetchOnce };
}
