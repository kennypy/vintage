import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import PostHog from 'posthog-react-native';

let sharedClient: PostHog | null = null;

/**
 * Lazily initialise the mobile PostHog client and expose it to
 * any caller that needs to capture a custom event.
 *
 * The init is idempotent — we keep the singleton in a module-level
 * binding so multiple mounts don't create multiple clients.
 *
 * Disabled when EXPO_PUBLIC_POSTHOG_KEY is unset (dev default).
 */
export function getPostHog(): PostHog | null {
  if (sharedClient) return sharedClient;
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const host =
    process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  sharedClient = new PostHog(key, {
    host,
    // Mobile doesn't autocapture the way web does; manual named
    // events are the signal. Flush every 20 events OR every 10s so
    // we don't lose the tail of a session on app-background.
    flushAt: 20,
    flushInterval: 10_000,
    // Session replay off — it's expensive on mobile bandwidth and
    // we haven't decided on the LGPD framing. Turn on later from
    // the dashboard if we want it.
    enableSessionReplay: false,
  });
  return sharedClient;
}

/**
 * Mount this once near the root (_layout.tsx). Fires a page_view
 * event every time expo-router's pathname changes. Screen-level
 * named events stay a TODO — the pathname signal is enough for
 * activation / funnel slicing by route.
 */
export function PostHogBootstrap() {
  const pathname = usePathname();
  const lastReportedRef = useRef<string | null>(null);

  useEffect(() => {
    const client = getPostHog();
    if (!client) return;
    if (!pathname) return;
    if (lastReportedRef.current === pathname) return;
    lastReportedRef.current = pathname;
    client.capture('page_view', {
      screen: pathname,
      platform: 'mobile',
    });
  }, [pathname]);

  return null;
}
