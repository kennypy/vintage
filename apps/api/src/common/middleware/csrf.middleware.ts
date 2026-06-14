import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { MetricsService } from '../../metrics/metrics.service';
import { SESSION_COOKIE_NAME } from '../../auth/cookie.constants';

// 2 days. Well above the mobile client's 23h CSRF cache (apps/mobile/
// src/services/api.ts) so tokens don't expire mid-cache, but far below
// the old 7-day window — a leaked token shouldn't stay replayable for a
// week. Refresh is cheap: clients re-fetch on any 403-CSRF.
const CSRF_TOKEN_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Sentinel boundTo for tokens minted without an authenticated session
// (e.g. a pre-login fetch). Such tokens are rejected on authenticated
// state-changing requests, forcing a one-time re-fetch that binds to the
// now-known user. Pre-auth mutating routes (login/register/refresh) are
// CSRF-excluded in app.module.ts, so they never hit that rejection.
const ANON_BINDING = 'anon';

/**
 * CSRF protection using stateless HMAC-signed, SESSION-BOUND tokens.
 *
 * Token format: `<timestamp>:<nonce>:<boundTo>:<hmac>`
 * - timestamp: Unix ms (number)
 * - nonce: 16 random bytes as hex
 * - boundTo: the user id the token was minted for, or "anon"
 * - hmac: HMAC-SHA256(timestamp:nonce:boundTo, CSRF_SECRET) as hex
 *
 * The boundTo binding means a token minted for user A cannot be replayed
 * on a state-changing request that authenticates as user B — so even if
 * SameSite ever regresses (the layer that currently makes CSRF moot), a
 * cross-user forged request still fails. The requester's id is read from
 * the session cookie or the Bearer access token at verify time.
 *
 * Clients:
 *   1. Call GET /api/v1/auth/csrf-token (authenticated) to receive a token.
 *   2. Include it in the X-CSRF-Token header on every state-changing request.
 *
 * Machine-to-machine routes (partner API, webhooks) are excluded
 * via app.module.ts route exclusions — not via header sniffing.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly secret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
    private readonly jwtService: JwtService,
  ) {
    const configured = this.configService.get<string>('CSRF_SECRET') ?? '';
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    // Outside development, a missing CSRF_SECRET is a hard startup error.
    // main.ts already asserts this in production, but staging / CI / preview
    // envs (NODE_ENV !== 'development' && !== 'production') used to silently
    // fall through to the 'dev-csrf-secret' literal below — a predictable
    // secret any attacker could sign tokens with. Refuse to start instead.
    if (!configured) {
      if (nodeEnv !== 'development' && nodeEnv !== 'test') {
        throw new Error(
          `CSRF_SECRET is required when NODE_ENV=${nodeEnv}. Set it to a 32+ byte random hex string.`,
        );
      }
      this.logger.warn(
        'CSRF_SECRET not configured — using ephemeral dev fallback. Set it for any non-development run.',
      );
    }

    // Development fallback is a per-process random value, not a literal.
    // That way a forgotten env var still gets you a working CSRF check,
    // but a misconfigured deployment can't be attacked with a globally
    // known secret.
    this.secret = configured || crypto.randomBytes(32).toString('hex');
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
      this.metrics.authCsrfRejected.inc({ reason: 'missing' });
      throw new ForbiddenException('Token CSRF ausente.');
    }

    // Identity of the caller as proven by the request's own credential
    // (session cookie or Bearer access token). undefined for an
    // unauthenticated request — those either hit a CSRF-excluded route or
    // get 401'd by the route guard after this passes, so we don't enforce
    // binding on them here.
    const requesterId = this.extractUserId(req);

    if (!this.verifyToken(token, requesterId)) {
      this.logger.warn(
        `CSRF token invalid on ${req.method} ${req.path}`,
      );
      this.metrics.authCsrfRejected.inc({ reason: 'invalid' });
      throw new ForbiddenException('Token CSRF inválido ou expirado.');
    }

    return next();
  }

  /**
   * Best-effort extraction of the caller's user id from the session
   * cookie (web) or the Bearer access token (mobile). Uses `decode`, not
   * `verify`: the route's JwtAuthGuard performs the authoritative
   * signature/expiry check, so a forged token can't gain access — and
   * decoding (rather than verifying) means an *expired-but-real* access
   * token still binds correctly instead of churning a 403/refresh cycle.
   * Returns undefined for absent/malformed/non-access tokens.
   */
  private extractUserId(req: Request): string | undefined {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    const authHeader = req.headers['authorization'];
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : undefined;
    const raw = cookieToken || bearer;
    if (!raw) return undefined;
    try {
      const decoded = this.jwtService.decode(raw) as
        | { sub?: string; type?: string }
        | null;
      // Only access tokens (no `type` claim) bind a session. Refresh and
      // twofa_pending tokens carry a `type` and must not be treated as a
      // logged-in identity here.
      if (decoded && !decoded.type && typeof decoded.sub === 'string') {
        return decoded.sub;
      }
    } catch {
      /* malformed token — treat as unauthenticated */
    }
    return undefined;
  }

  /**
   * Generate a CSRF token bound to the supplied user id (or anonymous).
   * Prefer {@link generateTokenForRequest} so the binding is derived from
   * the caller's own credential.
   */
  generateToken(boundTo: string = ANON_BINDING): string {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${nonce}:${boundTo}`;
    const hmac = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
    return `${payload}:${hmac}`;
  }

  /** Mint a CSRF token bound to whoever the request authenticates as. */
  generateTokenForRequest(req: Request): string {
    return this.generateToken(this.extractUserId(req) ?? ANON_BINDING);
  }

  /**
   * Verify a CSRF token: signature, expiry, and (when the caller is
   * authenticated) that the token was minted for that same user.
   */
  private verifyToken(token: string, requesterId?: string): boolean {
    const parts = token.split(':');
    if (parts.length !== 4) return false;

    const [timestampStr, nonce, boundTo, providedHmac] = parts;
    const timestamp = Number(timestampStr);

    if (!Number.isFinite(timestamp)) return false;

    // Check expiry
    if (Date.now() - timestamp > CSRF_TOKEN_TTL_MS) return false;

    const payload = `${timestamp}:${nonce}:${boundTo}`;
    const expectedHmac = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    // Guard against length mismatch before timingSafeEqual
    if (
      Buffer.byteLength(providedHmac) !== Buffer.byteLength(expectedHmac)
    ) {
      return false;
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(providedHmac),
        Buffer.from(expectedHmac),
      )
    ) {
      return false;
    }

    // Session binding. When the request is authenticated, the token must
    // have been minted for that user. An "anon" token (issued before the
    // session was known) is refused on an authenticated request, forcing a
    // one-time re-fetch that binds correctly. Unauthenticated requests
    // (requesterId === undefined) skip binding — the route guard handles
    // them.
    if (requesterId !== undefined && boundTo !== requesterId) {
      return false;
    }

    return true;
  }
}
