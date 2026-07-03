import { SetMetadata } from '@nestjs/common';

export const FAIL_CLOSED_THROTTLE_KEY = 'failClosedThrottle';

/**
 * Marks a route whose rate limiter must fail CLOSED (503) when the Redis
 * throttler backend is unavailable, instead of the default fail-open.
 *
 * The store fails open on Redis outages by design — refusing every request
 * would turn a degraded cache into a total outage, and browse traffic
 * should stay up. But for credential / enumeration surfaces (login,
 * register, password reset) failing open silently removes brute-force
 * protection exactly when an attacker would most like it gone. Those routes
 * carry this marker so HashThrottlerGuard returns 503 while Redis is down
 * rather than waving unlimited attempts through.
 */
export const FailClosedThrottle = () =>
  SetMetadata(FAIL_CLOSED_THROTTLE_KEY, true);
