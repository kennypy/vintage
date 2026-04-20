/**
 * Security headers applied to every response. Matches the requirements in
 * CLAUDE.md §Security Standards.
 *
 * The production CSP is strict per CLAUDE.md: no 'unsafe-inline' in
 * script-src, no 'unsafe-eval', connect-src locked to the real API hosts.
 *
 * Dev mode needs a narrow carveout because Next.js's dev runtime injects
 * inline bootstrap scripts and React Fast Refresh uses eval(). Without it
 * the browser blocks every client script, React never hydrates, form
 * handlers never attach, and clicking a submit button falls through to a
 * native GET (which is how this bug was discovered on Windows local dev).
 * The dev carveout is compiled out in production builds.
 */
const isDev = process.env.NODE_ENV !== 'production';

// Cloudflare Turnstile loads its widget script from challenges.cloudflare.com
// and runs the challenge inside an iframe on the same host; PostHog's
// browser SDK POSTs events to eu.i.posthog.com / us.i.posthog.com (configurable
// via NEXT_PUBLIC_POSTHOG_HOST). Without these CSP carveouts the production
// build silently breaks captcha on /auth/* and analytics everywhere — pages
// render, but the widget + event pipeline get blocked by the browser.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const POSTHOG_CONNECT_ORIGINS = 'https://eu.i.posthog.com https://us.i.posthog.com https://*.i.posthog.com';

const scriptSrc = isDev
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_ORIGIN}`
  : `script-src 'self' ${TURNSTILE_ORIGIN}`;

const connectSrc = isDev
  ? `connect-src 'self' http://localhost:3001 ws://localhost:3000 https://api.vintage.br https://api-staging.vintage.br ${TURNSTILE_ORIGIN} ${POSTHOG_CONNECT_ORIGINS}`
  : `connect-src 'self' https://api.vintage.br https://api-staging.vintage.br ${TURNSTILE_ORIGIN} ${POSTHOG_CONNECT_ORIGINS}`;

const frameSrc = `frame-src ${TURNSTILE_ORIGIN}`;

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      // `blob:` is required for file-upload previews — the sell page
      // wraps user-selected File objects in URL.createObjectURL() before
      // they're uploaded to S3. blob: URLs are same-origin by definition
      // (browsers refuse cross-origin blob references), so the stored-XSS
      // risk is limited to the attacker's existing XSS capability — they
      // can already render arbitrary content once they have script
      // execution; allowing blob: for images doesn't widen that surface
      // meaningfully. Kept out of script-src where it genuinely would.
      "img-src 'self' https: blob:",
      "font-src 'self' data:",
      connectSrc,
      frameSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vintage/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vintage-br.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'vintage-br-staging.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.vintage.br',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
