import { NextResponse } from 'next/server';

/**
 * Apple App Site Association (AASA) — the contract between this
 * domain and the iOS app that enables Universal Links. When a user
 * taps a `https://vintage.br/listing/<id>` link in Mail / iMessage /
 * Safari, iOS fetches this file (on install and periodically), and
 * if the path matches the `paths` array below it opens the app
 * instead of Safari.
 *
 * Apple requires the file at EXACTLY
 *   https://<domain>/.well-known/apple-app-site-association
 * with Content-Type application/json, no redirects, no auth, and
 * NO file extension. This route handler satisfies all four.
 *
 * Configuration lives in env so ops can rotate without a redeploy:
 *   APPLE_TEAM_ID       — 10-char alphanumeric from App Store Connect
 *   IOS_BUNDLE_ID       — matches apps/mobile/app.json ios.bundleIdentifier
 *                         (defaults to br.vintage.app)
 *
 * If APPLE_TEAM_ID is missing we return 503 rather than a partial
 * file — a misconfigured AASA silently breaks Universal Links on
 * install; 503 makes the misconfiguration loud in the setup checklist.
 */
export const runtime = 'nodejs';
// Apple caches aggressively; don't let Next.js cache on top of that
// because rotating Team IDs during setup would leave us stuck.
export const dynamic = 'force-dynamic';

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.IOS_BUNDLE_ID ?? 'br.vintage.app';

  if (!teamId) {
    return NextResponse.json(
      {
        error:
          'APPLE_TEAM_ID not configured — Universal Links disabled. Set the env var and redeploy.',
      },
      { status: 503 },
    );
  }

  // Paths that should open the app. Everything else (e.g. /ajuda,
  // /sobre, marketing pages) falls through to Safari. "NOT /"
  // prevents the home page from hijacking — we want Safari to win
  // when a user clicks a bare vintage.br link.
  const paths = [
    '/listing/*',
    '/listings/*',
    '/orders/*',
    '/offers/*',
    '/messages/*',
    '/conversation/*',
    '/dispute/*',
    '/profile/*',
  ];

  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${bundleId}`],
          components: paths.map((p) => ({ '/': p })),
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      // Explicit Content-Type — Apple's fetcher bails on anything else.
      'Content-Type': 'application/json',
    },
  });
}
