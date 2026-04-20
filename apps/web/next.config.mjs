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

const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self'";

const connectSrc = isDev
  ? "connect-src 'self' http://localhost:3001 ws://localhost:3000 https://api.vintage.br https://api-staging.vintage.br"
  : "connect-src 'self' https://api.vintage.br https://api-staging.vintage.br";

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
      // No `blob:` — we don't render any user-supplied blob/data URIs
      // anywhere. Allowing blob: would let stored XSS pop an attacker-
      // controlled image (which becomes a vector for phishing overlays
      // when combined with a CSS exploit). Re-add behind a strict scope
      // if a future feature legitimately needs it.
      "img-src 'self' https:",
      "font-src 'self' data:",
      connectSrc,
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
