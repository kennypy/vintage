import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Mobile Cloudflare Turnstile widget.
 *
 * Turnstile has no native Android/iOS SDK, so we host the widget in a
 * WebView pointing at an inline HTML payload. The widget posts the
 * solved token back via `window.ReactNativeWebView.postMessage(token)`
 * which the WebView surfaces via `onMessage`.
 *
 * When EXPO_PUBLIC_TURNSTILE_SITE_KEY is unset the widget renders
 * a dev-mode hint and no WebView — mirrors apps/web's TurnstileWidget
 * behaviour. The backend CaptchaGuard is a no-op unless
 * CAPTCHA_ENFORCE=true, so dev registrations succeed without a token.
 */

interface Props {
  onToken: (token: string) => void;
  onExpired?: () => void;
}

const WIDGET_HEIGHT = 70;

export function TurnstileWebView({ onToken, onExpired }: Props) {
  const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  const html = useMemo(() => buildTurnstileHtml(siteKey), [siteKey]);

  if (!siteKey) {
    return (
      <View style={styles.hint}>
        <Text style={styles.hintText}>
          (Turnstile desativado — configure EXPO_PUBLIC_TURNSTILE_SITE_KEY)
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ html, baseUrl: 'https://challenges.cloudflare.com' }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['https://*', 'https://challenges.cloudflare.com']}
        onMessage={(event) => {
          // event.nativeEvent.data may be a raw token OR the literal
          // string 'expired' / 'error'. We forward accordingly.
          const data = event.nativeEvent.data ?? '';
          if (!data) return;
          if (data === 'expired') {
            onExpired?.();
            return;
          }
          if (data.startsWith('error:')) {
            // Surface unrecognised errors as an expiry so the caller's
            // captchaToken resets and the user re-solves.
            onExpired?.();
            return;
          }
          onToken(data);
        }}
      />
    </View>
  );
}

/**
 * Minimal HTML shell for the Turnstile challenge. Loaded via
 * `source={{ html }}` so no remote page needs to exist — the
 * Cloudflare JS is pulled from challenges.cloudflare.com as a
 * script tag.
 */
function buildTurnstileHtml(siteKey: string): string {
  // siteKey goes into the attribute verbatim — Cloudflare site keys
  // are alphanumeric + hyphens, so no escaping needed, but we defend
  // anyway in case a bogus value ends up in env.
  const safeSiteKey = siteKey.replace(/[^A-Za-z0-9_-]/g, '');
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    .wrap { display: flex; justify-content: center; align-items: center; padding: 4px; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <div class="wrap">
    <div class="cf-turnstile"
         data-sitekey="${safeSiteKey}"
         data-callback="onTurnstileToken"
         data-expired-callback="onTurnstileExpired"
         data-error-callback="onTurnstileError"></div>
  </div>
  <script>
    function post(msg) {
      if (window.ReactNativeWebView &&
          typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(msg);
      }
    }
    function onTurnstileToken(token) { post(token); }
    function onTurnstileExpired() { post('expired'); }
    function onTurnstileError(code) { post('error:' + (code || 'unknown')); }
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    height: WIDGET_HEIGHT,
    width: '100%',
    backgroundColor: 'transparent',
  },
  webview: {
    backgroundColor: 'transparent',
  },
  hint: {
    padding: 8,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});
