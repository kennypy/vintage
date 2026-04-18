import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CaptchaService } from './captcha.service';

/**
 * Guard that demands a valid Cloudflare Turnstile token on the
 * request body (`captchaToken`). Reads it from the already-parsed
 * body — Nest runs express' body-parser middleware BEFORE guards,
 * so `req.body.captchaToken` is populated here.
 *
 * Fail-closed on verification failure, but the guard no-ops entirely
 * when `CAPTCHA_ENFORCE=false` (the default). That lets us land the
 * code AND the web widget without breaking existing mobile clients
 * that don't send a token yet. Post-launch, flipping CAPTCHA_ENFORCE
 * to true activates the wall for everyone — including mobile, which
 * will start returning 403 until the app update ships.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(private readonly captcha: CaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.captcha.enforceEnabled) return true;

    const req = context.switchToHttp().getRequest<
      Request & { body?: Record<string, unknown> }
    >();
    const token = req.body?.captchaToken as string | undefined;

    const remoteIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip;

    const ok = await this.captcha.verify(token, remoteIp);
    if (!ok) {
      throw new ForbiddenException(
        'Captcha inválido ou ausente. Resolva o desafio e tente novamente.',
      );
    }
    return true;
  }
}
