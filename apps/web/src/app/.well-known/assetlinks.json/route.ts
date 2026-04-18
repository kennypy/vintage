import { NextResponse } from 'next/server';

/**
 * Android Asset Links — the Android equivalent of AASA. Tells the
 * OS which app package may handle https://vintage.br/* URLs with
 * `autoVerify=true` intent filters. Without this file, tapping a
 * listing link in Gmail / WhatsApp opens Chrome instead of the app.
 *
 * The file MUST be at https://<domain>/.well-known/assetlinks.json
 * (with the .json extension, unlike AASA) and return JSON.
 *
 * Configuration:
 *   ANDROID_PACKAGE       — matches apps/mobile/app.json android.package
 *                           (defaults to br.vintage.app)
 *   ANDROID_CERT_SHA256   — colon-separated, uppercase, 95 chars.
 *                           Get from Play Console → Release → Setup →
 *                           App Integrity → App Signing Certificate.
 *                           Multiple comma-separated fingerprints
 *                           supported so debug + release builds can
 *                           coexist.
 *
 * Missing ANDROID_CERT_SHA256 returns 503 rather than a partial file
 * so misconfiguration is loud during launch setup.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE ?? 'br.vintage.app';
  const rawFingerprints = process.env.ANDROID_CERT_SHA256;

  if (!rawFingerprints) {
    return NextResponse.json(
      {
        error:
          'ANDROID_CERT_SHA256 not configured — Android App Links disabled. Set the env var (colon-separated SHA-256 fingerprint from Play Console) and redeploy.',
      },
      { status: 503 },
    );
  }

  const fingerprints = rawFingerprints
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const body = [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
      ],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: { 'Content-Type': 'application/json' },
  });
}
