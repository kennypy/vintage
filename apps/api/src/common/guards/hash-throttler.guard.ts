import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiter keyed by the AUTHENTICATED user id when available,
 * falling back to the caller's IP.
 *
 * Why two trackers:
 *   * On unauthenticated endpoints (login, register, csrf-token,
 *     password-reset) we have no user id yet. IP is the only signal.
 *     An attacker rotating IPs can defeat this — that's acknowledged,
 *     and it's why the login path has its own per-email lockout
 *     (see auth.service).
 *   * On authenticated endpoints, IP alone is wrong in the OTHER
 *     direction: a compromised account behind a shared proxy is
 *     throttled at the IP level against every other legitimate user
 *     on the same IP. Keying by user.id lets us apply tight per-user
 *     limits on high-value actions (wallet payout, listing create,
 *     report create, coupon validate) without collateral damage to
 *     bystanders. Pre-launch hardening follow-up to pen-test track 1.
 *
 * We DO NOT trust X-API-Key for bucketing (the original broken
 * behaviour). The header is client-controlled and never validated
 * anywhere in this codebase — partner routes use X-Partner-Key via
 * AdPartnerAuthGuard, which is authenticated separately.
 */
@Injectable()
export class HashThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    // req.user is populated by JwtStrategy when the route is guarded.
    // Prefix `u:` so an attacker-controlled input could never collide
    // with an authenticated bucket (IPs are dotted numeric or IPv6;
    // `u:` keeps the namespaces separate even if IP parsing drifts).
    const user = req['user'] as { id?: string } | undefined;
    if (user?.id) {
      return `u:${user.id}`;
    }
    const ip =
      (req['ip'] as string | undefined) ??
      ((req['connection'] as { remoteAddress?: string } | undefined)
        ?.remoteAddress) ??
      'unknown';
    return `ip:${ip}`;
  }
}
