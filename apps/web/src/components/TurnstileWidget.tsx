'use client';

import { useEffect, useRef } from 'react';

/**
 * Minimal Cloudflare Turnstile integration. Loads the Turnstile JS
 * once (idempotent — if the script is already on the page we skip the
 * insert), renders an implicit widget, and calls `onToken` with the
 * challenge response when the user passes the check.
 *
 * The widget is invisible / managed by Cloudflare — users see either
 * nothing (invisible mode) or a quick checkbox (managed mode)
 * depending on the site-key configuration.
 *
 * When NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing the component
 * renders a small dev-mode hint instead of a widget — useful during
 * local development where we haven't provisioned a Turnstile site.
 * The parent form should still attempt submit; the backend
 * CaptchaGuard no-ops unless CAPTCHA_ENFORCE=true on the server side,
 * so dev flows don't break.
 */
interface TurnstileWindow extends Window {
  turnstile?: {
    render: (
      container: HTMLElement | string,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
      },
    ) => string;
    remove: (widgetId: string) => void;
    reset: (widgetId: string) => void;
  };
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

function ensureScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as TurnstileWindow).turnstile) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src^="${TURNSTILE_SRC}"]`,
  );
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
    });
  }

  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `${TURNSTILE_SRC}?render=explicit`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  onToken,
  onExpired,
}: {
  onToken: (token: string) => void;
  onExpired?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Hold callbacks in refs so the useEffect below depends only on
  // siteKey. If we put onToken/onExpired in the deps array the
  // widget would remount on every parent render, wiping the solved
  // state and looping forever.
  const onTokenRef = useRef(onToken);
  const onExpiredRef = useRef(onExpired);
  onTokenRef.current = onToken;
  onExpiredRef.current = onExpired;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    ensureScript().then(() => {
      if (cancelled) return;
      const ts = (window as TurnstileWindow).turnstile;
      if (!ts || !containerRef.current) return;
      widgetIdRef.current = ts.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => {
          onExpiredRef.current?.();
        },
      });
    });

    return () => {
      cancelled = true;
      const ts = (window as TurnstileWindow).turnstile;
      if (ts && widgetIdRef.current) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {
          /* widget may already be torn down if the script reloaded */
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <div className="text-xs text-gray-400 italic">
        (Turnstile desativado — configure NEXT_PUBLIC_TURNSTILE_SITE_KEY para ativar)
      </div>
    );
  }

  return <div ref={containerRef} data-testid="turnstile-widget" />;
}
