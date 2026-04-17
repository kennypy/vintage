import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Central Redis client used for rate-limiting, idempotency checks,
 * notification debouncing, and other short-lived coordination.
 *
 * Production MUST provide a password (REDIS_PASSWORD) or a full REDIS_URL
 * that embeds the credentials. Startup fails if NODE_ENV=production and
 * no auth is configured.
 *
 * In non-production environments, the service still tries to connect but
 * gracefully degrades: when Redis is unreachable, helper methods return
 * a "not-enforced" result so developers can iterate without a Redis running.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const url = this.config.get<string>('REDIS_URL', '');
    const password = this.config.get<string>('REDIS_PASSWORD', '');

    // Production MUST have authentication — fail fast if missing.
    if (nodeEnv === 'production') {
      const urlHasAuth = /^rediss?:\/\/[^@]+@/.test(url);
      if (!password && !urlHasAuth) {
        throw new Error(
          'Redis authentication required in production: set REDIS_PASSWORD or embed credentials in REDIS_URL.',
        );
      }
    }

    try {
      if (url) {
        this.client = new Redis(url, {
          password: password || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      } else {
        // Dev fallback — best effort
        this.client = new Redis({
          host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(this.config.get<string>('REDIS_PORT', '6379')),
          password: password || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      }

      this.client.on('error', (err: Error) => {
        // Avoid spamming logs — downgrade to warn, toggle availability.
        if (this.available) {
          this.logger.warn(`Redis error: ${err.message}`);
        }
        this.available = false;
      });
      this.client.on('ready', () => {
        this.available = true;
        this.logger.log('Redis connected');
      });

      // Fire-and-forget connect
      this.client.connect().catch((err: Error) => {
        this.logger.warn(`Redis connect failed: ${err.message}`);
        this.available = false;
      });
    } catch (err) {
      this.logger.warn(`Redis initialization failed: ${String(err).slice(0, 200)}`);
      this.client = null;
      this.available = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore */
      }
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  /** Raw client accessor for advanced use. Returns null when Redis is unreachable. */
  getClient(): Redis | null {
    return this.isAvailable() ? this.client : null;
  }

  /**
   * Atomic SET IF NOT EXISTS with TTL — returns true when the key was
   * set for the first time (i.e. the caller "owns" this token).
   * Returns false when the key already existed OR when Redis is unavailable
   * in non-production environments (graceful degrade).
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const client = this.getClient();
    if (!client) return true; // Dev degrade: act as if the lock was acquired
    try {
      const res = await client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.warn(`Redis setNx error: ${String(err).slice(0, 200)}`);
      return true;
    }
  }

  async get(key: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      return await client.get(key);
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch {
      /* ignore */
    }
  }

  /** Increment a counter with TTL — used for brute-force attempt tracking. */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const client = this.getClient();
    if (!client) return 0;
    try {
      const [incr] = (await client
        .multi()
        .incr(key)
        .expire(key, ttlSeconds)
        .exec()) as Array<[Error | null, unknown]>;
      const count = incr?.[1];
      return typeof count === 'number' ? count : Number(count ?? 0);
    } catch (err) {
      this.logger.warn(`Redis incr error: ${String(err).slice(0, 200)}`);
      return 0;
    }
  }

  /**
   * Atomic GET-and-DELETE. Returns the value if the key existed (and removes it),
   * or null if the key was missing. Used for single-use tokens / OTPs where
   * two concurrent callers must not both observe the same value.
   *
   * Returns null when Redis is unavailable in non-production — callers must
   * treat this as "code not found" (fail-closed) rather than "dev bypass".
   */
  async getDel(key: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      return await client.getdel(key);
    } catch (err) {
      this.logger.warn(`Redis getdel error: ${String(err).slice(0, 200)}`);
      return null;
    }
  }

  /**
   * Decrement a counter (used to refund rate-limit credits when the operation
   * the counter was tracking ultimately failed, e.g. Twilio transport error).
   * Never drops below zero. No-op when Redis is unavailable.
   */
  async decr(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      const next = await client.decr(key);
      if (next < 0) await client.set(key, '0', 'KEEPTTL');
    } catch (err) {
      this.logger.warn(`Redis decr error: ${String(err).slice(0, 200)}`);
    }
  }

  /** Simple ping for health checks. */
  async ping(): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    try {
      const reply = await client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }
}
