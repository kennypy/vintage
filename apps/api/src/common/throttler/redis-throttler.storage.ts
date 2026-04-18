import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../services/redis.service';

// The record shape is declared in an internal interface file that
// @nestjs/throttler doesn't re-export on its public surface (verified
// on v6.4.x). Mirror the shape locally — it's stable and small.
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed ThrottlerStorage. Replaces the default in-memory store so
 * rate limits are shared across API instances.
 *
 * The in-memory default fails open the moment the API is horizontally
 * scaled: an attacker can pin to a cold instance to reset their counter.
 * This implementation stores two keys per (throttlerName, trackerKey):
 *
 *   throttle:<name>:<key>           — the hit counter (INCR with PEXPIRE
 *                                     on first hit to install the TTL)
 *   throttle:<name>:<key>:blocked   — block marker (set only when the
 *                                     limit is exceeded and the
 *                                     throttler has a blockDuration)
 *
 * Behavior under Redis unavailability: fails OPEN with a warning log. The
 * rationale is pragmatic — refusing every request when Redis goes down
 * would turn a degraded cache into a total outage, and the rate-limit
 * buckets that matter most (SMS 2FA sends, password reset, CPF set)
 * already have fail-closed checks in the service layer that use a
 * separate `RedisService.isAvailable()` gate. Document this openness so
 * ops can decide whether to tighten post-launch.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis.getClient();
    if (!client) {
      this.logger.warn(
        `Redis throttler storage unavailable — failing open for ${throttlerName}:${key}`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.floor(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;

    try {
      // Existing block short-circuits the counter increment — otherwise a
      // blocked user could refresh their block window indefinitely.
      const blockTtl = await client.pttl(blockKey);
      if (blockTtl > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: Math.floor(blockTtl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.floor(blockTtl / 1000),
        };
      }

      // INCR + PTTL in a single round-trip. If this is the first hit on
      // the counter, PTTL returns -1 and we install the TTL; subsequent
      // hits reuse the remaining TTL so the window is tied to the FIRST
      // request, not the last (matches the default in-memory semantics).
      const res = (await client
        .multi()
        .incr(counterKey)
        .pttl(counterKey)
        .exec()) as Array<[Error | null, unknown]> | null;

      if (!res || res.length < 2) {
        throw new Error('Unexpected Redis multi response');
      }
      const totalHits = Number(res[0][1] ?? 0);
      let counterTtl = Number(res[1][1] ?? -1);

      if (counterTtl === -1) {
        await client.pexpire(counterKey, ttl);
        counterTtl = ttl;
      }

      if (totalHits > limit) {
        // Only install a block marker when the throttler actually declares
        // blockDuration > 0. With blockDuration === 0 the caller gets
        // isBlocked=true for this request but the counter resets on TTL
        // like usual — matches the default storage.
        if (blockDuration > 0) {
          await client.set(blockKey, '1', 'PX', blockDuration, 'NX');
        }
        return {
          totalHits,
          timeToExpire: Math.floor(counterTtl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.floor(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire: Math.floor(counterTtl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch (err) {
      this.logger.warn(
        `Redis throttler error for ${throttlerName}:${key}: ${String(err).slice(0, 200)}`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.floor(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
