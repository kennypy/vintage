import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Security headers applied to every response. Matches the requirements in
 * CLAUDE.md §Security Standards.
 */
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
    // App Router lets us omit 'unsafe-inline' for script-src.
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.vintage.br https://api-staging.vintage.br",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const localReactPath = path.resolve(__dirname, 'node_modules/react');
const localReactDomPath = path.resolve(__dirname, 'node_modules/react-dom');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vintage/shared'],
  // Force Next's webpack + SWC resolvers to use web-local React 18, never the
  // monorepo-root React 19 that's hoisted for the mobile workspace.
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      react: localReactPath,
      'react-dom': localReactDomPath,
      'react/jsx-runtime': path.join(localReactPath, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(localReactPath, 'jsx-dev-runtime.js'),
    };
    return config;
  },
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
