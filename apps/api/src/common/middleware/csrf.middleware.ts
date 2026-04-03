import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection using stateless HMAC-signed tokens.
 *
 * Token format: `<timestamp>:<nonce>:<hmac>`
 * - timestamp: Unix ms (number)
 * - nonce: 16 random bytes as hex
 * - hmac: HMAC-SHA256(timestamp:nonce, CSRF_SECRET) as hex
 *
 * Clients:
 *   1. Call GET /api/v1/auth/csrf-token to receive a token.
 *   2. Include it in the X-CSRF-Token header on every state-changing request.
 *
 * Machine-to-machine routes (partner API, webhooks) are excluded
 * via app.module.ts route exclusions — not via header sniffing.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('CSRF_SECRET') ?? '';

    if (!this.secret) {
      this.logger.warn(
        'CSRF_SECRET not configured — CSRF protection will be reduced in dev mode',
      );
    }
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Skip safe HTTP methods
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const token = req.headers['x-csrf-token'] as string | undefined;

    if (!token) {
      this.logger.warn(
        `CSRF token missing on ${req.method} ${req.path}`,
      );
      throw new ForbiddenException('Token CSRF ausente.');
    }

    if (!this.verifyToken(token)) {
      this.logger.warn(
        `CSRF token invalid on ${req.method} ${req.path}`,
      );
      throw new ForbiddenException('Token CSRF inválido ou expirado.');
    }

    return next();
  }

  /**
   * Generate a new HMAC-signed CSRF token valid for 24 hours.
   */
  generateToken(): string {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${nonce}`;
    const hmac = crypto
      .createHmac('sha256', this.secret || 'dev-csrf-secret')
      .update(payload)
      .digest('hex');
    return `${payload}:${hmac}`;
  }

  /**
   * Verify a CSRF token: check signature and expiry.
   */
  private verifyToken(token: string): boolean {
    const parts = token.split(':');
    if (parts.length !== 3) return false;

    const [timestampStr, nonce, providedHmac] = parts;
    const timestamp = Number(timestampStr);

    if (!Number.isFinite(timestamp)) return false;

    // Check expiry
    if (Date.now() - timestamp > CSRF_TOKEN_TTL_MS) return false;

    const payload = `${timestamp}:${nonce}`;
    const expectedHmac = crypto
      .createHmac('sha256', this.secret || 'dev-csrf-secret')
      .update(payload)
      .digest('hex');

    // Guard against length mismatch before timingSafeEqual
    if (
      Buffer.byteLength(providedHmac) !== Buffer.byteLength(expectedHmac)
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(providedHmac),
      Buffer.from(expectedHmac),
    );
  }
}
