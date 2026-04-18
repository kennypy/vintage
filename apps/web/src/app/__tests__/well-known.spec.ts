/**
 * @jest-environment node
 *
 * Contract tests for the .well-known route handlers. Apple and Google
 * both refuse silently if the JSON shape is wrong, so these tests pin
 * the exact payload structure + content-type + error-when-unconfigured
 * behaviour against regression.
 *
 * Uses the node environment because `next/server` depends on the Web
 * Fetch API's `Request` global, which jsdom (the default here) doesn't
 * expose.
 */
import { GET as getAppleAASA } from '../.well-known/apple-app-site-association/route';
import { GET as getAssetLinks } from '../.well-known/assetlinks.json/route';

describe('apple-app-site-association', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.APPLE_TEAM_ID;
    delete process.env.IOS_BUNDLE_ID;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 503 when APPLE_TEAM_ID is missing (loud misconfiguration)', async () => {
    const res = getAppleAASA();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/APPLE_TEAM_ID not configured/);
  });

  it('returns applinks JSON with correct appID structure when configured', async () => {
    process.env.APPLE_TEAM_ID = 'TESTTEAM01';
    process.env.IOS_BUNDLE_ID = 'br.vintage.app';

    const res = getAppleAASA();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);

    const body = await res.json();
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appIDs).toEqual(['TESTTEAM01.br.vintage.app']);
    // Must include listing routes — this is the primary share target.
    const paths = body.applinks.details[0].components.map(
      (c: { '/': string }) => c['/'],
    );
    expect(paths).toEqual(
      expect.arrayContaining(['/listing/*', '/orders/*', '/conversation/*']),
    );
  });

  it('defaults IOS_BUNDLE_ID to br.vintage.app when unset', async () => {
    process.env.APPLE_TEAM_ID = 'TESTTEAM01';

    const body = await getAppleAASA().json();
    expect(body.applinks.details[0].appIDs).toEqual(['TESTTEAM01.br.vintage.app']);
  });
});

describe('assetlinks.json', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ANDROID_CERT_SHA256;
    delete process.env.ANDROID_PACKAGE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 503 when ANDROID_CERT_SHA256 is missing', async () => {
    const res = getAssetLinks();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/ANDROID_CERT_SHA256 not configured/);
  });

  it('returns the Android App Links array with a single fingerprint', async () => {
    process.env.ANDROID_CERT_SHA256 =
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

    const res = getAssetLinks();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(body[0].target.namespace).toBe('android_app');
    expect(body[0].target.package_name).toBe('br.vintage.app');
    expect(body[0].target.sha256_cert_fingerprints).toHaveLength(1);
  });

  it('supports multiple comma-separated fingerprints (debug + release coexistence)', async () => {
    process.env.ANDROID_CERT_SHA256 =
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99, 11:22:33:44:55:66:77:88:99:00:11:22:33:44:55:66:77:88:99:00:11:22:33:44:55:66:77:88:99:00:11:22';

    const body = await getAssetLinks().json();
    expect(body[0].target.sha256_cert_fingerprints).toHaveLength(2);
  });
});
