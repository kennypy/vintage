import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cloudflare Turnstile siteverify endpoint. Public, no auth on URL —
 * auth is via the secret in the POST body.
 */
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Maximum time we'll wait on Cloudflare before giving up. The
 * endpoint is globally edge-served and usually responds in <100ms,
 * so 3s is generous. Failing closed on timeout is deliberate — we
 * don't want a Cloudflare incident to silently let bots through.
 */
const VERIFY_TIMEOUT_MS = 3000;

/**
 * Verifies Cloudflare Turnstile challenge tokens.
 *
 * Activation is gated on two env vars:
 *   TURNSTILE_SECRET_KEY — the server-side secret (required once we
 *                          start enforcing).
 *   CAPTCHA_ENFORCE      — 'true' flips the guard on. Default off
 *                          so we can ship the code with confidence,
 *                          run it in silent-verify mode in staging,
 *                          then flip the flag post-launch without
 *                          another deploy.
 *
 * `verify()` ALWAYS runs when enforcement is on — a null/empty token
 * returns false immediately. The client is responsible for sending
 * `captchaToken` in the request body.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secretKey: string;
  public readonly enforceEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('TURNSTILE_SECRET_KEY', '');
    const raw = this.configService
      .get<string>('CAPTCHA_ENFORCE', 'false')
      .toLowerCase();
    this.enforceEnabled = raw === 'true' || raw === '1' || raw === 'yes';

    if (this.enforceEnabled && !this.secretKey) {
      // Loud: enforcing without a secret means every call fails
      // closed — not a fail mode we want in prod without a heads-up.
      this.logger.error(
        'CAPTCHA_ENFORCE=true but TURNSTILE_SECRET_KEY is empty. Every captcha check will FAIL. Set the secret or flip the enforce flag off.',
      );
    } else if (this.enforceEnabled) {
      this.logger.log('Turnstile captcha ENFORCEMENT enabled');
    }
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!token) return false;
    if (!this.secretKey) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
      const form = new URLSearchParams();
      form.set('secret', this.secretKey);
      form.set('response', token);
      if (remoteIp) form.set('remoteip', remoteIp);

      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify returned ${res.status}`);
        return false;
      }

      const data = (await res.json()) as {
        success?: boolean;
        'error-codes'?: string[];
      };

      if (!data.success) {
        this.logger.warn(
          `Turnstile token rejected: ${(data['error-codes'] ?? []).join(',')}`,
        );
        return false;
      }

      return true;
    } catch (err) {
      this.logger.warn(
        `Turnstile verify threw: ${String(err).slice(0, 200)}`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
