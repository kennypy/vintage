import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CaptchaService } from './captcha.service';

async function makeService(env: Record<string, string>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CaptchaService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((k: string, def?: string) => env[k] ?? def ?? ''),
        },
      },
    ],
  }).compile();
  return module.get<CaptchaService>(CaptchaService);
}

describe('CaptchaService', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  describe('enforceEnabled flag', () => {
    it('is false by default', async () => {
      const svc = await makeService({});
      expect(svc.enforceEnabled).toBe(false);
    });

    it.each([['true'], ['TRUE'], ['1'], ['yes']])(
      'parses CAPTCHA_ENFORCE=%s as on',
      async (val) => {
        const svc = await makeService({ CAPTCHA_ENFORCE: val });
        expect(svc.enforceEnabled).toBe(true);
      },
    );

    it.each([['false'], ['no'], ['0'], ['']])(
      'parses CAPTCHA_ENFORCE=%s as off',
      async (val) => {
        const svc = await makeService({ CAPTCHA_ENFORCE: val });
        expect(svc.enforceEnabled).toBe(false);
      },
    );
  });

  describe('verify', () => {
    it('returns false for missing token (even with a valid secret)', async () => {
      const svc = await makeService({ TURNSTILE_SECRET_KEY: 'sk_test' });
      expect(await svc.verify(undefined)).toBe(false);
      expect(await svc.verify('')).toBe(false);
    });

    it('returns false when no TURNSTILE_SECRET_KEY is configured', async () => {
      const svc = await makeService({});
      expect(await svc.verify('some-token')).toBe(false);
    });

    it('posts secret + response to Cloudflare siteverify and returns true on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const svc = await makeService({ TURNSTILE_SECRET_KEY: 'sk_test' });
      const ok = await svc.verify('user-token', '1.2.3.4');

      expect(ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('secret=sk_test'),
        }),
      );
      // remoteip is forwarded so Cloudflare can factor it into its risk model.
      expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain(
        'remoteip=1.2.3.4',
      );
    });

    it('returns false when Cloudflare reports success=false', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      });

      const svc = await makeService({ TURNSTILE_SECRET_KEY: 'sk_test' });
      expect(await svc.verify('bad-token')).toBe(false);
    });

    it('returns false when Cloudflare returns a non-2xx', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      const svc = await makeService({ TURNSTILE_SECRET_KEY: 'sk_test' });
      expect(await svc.verify('t')).toBe(false);
    });

    it('fails closed when fetch throws (treats Cloudflare outage as a block)', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ENETDOWN'));

      const svc = await makeService({ TURNSTILE_SECRET_KEY: 'sk_test' });
      expect(await svc.verify('t')).toBe(false);
    });
  });
});
