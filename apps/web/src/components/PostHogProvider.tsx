'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Client-side PostHog bootstrap. Initialises posthog-js once from
 * env, then fires $pageview on every route change (Next.js App
 * Router doesn't fire a full navigation event so we do it from
 * usePathname + useSearchParams).
 *
 * Disabled in two cases:
 *   - NEXT_PUBLIC_POSTHOG_KEY is unset — no-op (dev default).
 *   - typeof window === 'undefined' — SSR guard; posthog-js is
 *     browser-only.
 *
 * Autocapture is ON, so button clicks, form submits, and tag
 * changes flow through without per-component wiring. We pair that
 * with the server-side AnalyticsService's named funnel events
 * (user_registered, order_created, etc.) — server is the
 * authoritative signal; client-side is behavioural context.
 *
 * LGPD note: we DON'T identify users on the client. Posthog's
 * distinctId is whatever anonymous cookie it generates. Server-side
 * events already identify by User.id. The DPO's call on whether to
 * merge them belongs in RIPD §4.2 / §8.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (initializedRef.current) return;

    // Lazy import so SSR never touches the library.
    import('posthog-js').then((mod) => {
      const posthog = mod.default;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: false, // we fire it manually from the route-change effect
        autocapture: true,
        persistence: 'localStorage+cookie',
      });
      initializedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!initializedRef.current) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    import('posthog-js').then((mod) => {
      const posthog = mod.default;
      const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
      posthog.capture('$pageview', { $current_url: url });
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
