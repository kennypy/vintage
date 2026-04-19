import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiter keyed by the caller's IP address.
 *
 * Why not trust X-API-Key for bucketing (the previous behaviour): the
 * header is client-controlled and is NEVER validated anywhere in this
 * codebase (partner routes use X-Partner-Key, which is authenticated
 * separately). An attacker could defeat every @Throttle limit on
 * unauthenticated endpoints — including `/auth/login` — by sending a
 * fresh random `X-API-Key: <uuid>` on every request: each value
 * hashes to a unique bucket, so the limit is effectively one request
 * per bucket. This made the login throttle a no-op under a trivial
 * client-side loop.
 *
 * IP-only bucketing has the opposite failure mode (NAT'd users share a
 * bucket), but that's what the built-in ThrottlerGuard already does and
 * it's the standard trade-off. Per-user throttles that need more
 * precision (e.g. per-email login lockout in auth.service) live next
 * to the business logic, not the generic throttler.
 */
@Injectable()
export class HashThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const ip =
      (req['ip'] as string | undefined) ??
      ((req['connection'] as { remoteAddress?: string } | undefined)
        ?.remoteAddress) ??
      'unknown';
    return ip;
  }
}
