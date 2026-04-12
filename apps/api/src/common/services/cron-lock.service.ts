import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Simple distributed lock for cron jobs using the CronLock table.
 *
 * Uses an atomic upsert pattern: a lock row is created (or updated) only when
 * no unexpired lock exists. The `lockedUntil` column acts as the automatic
 * expiry — stale locks are overwritten once their TTL has passed.
 *
 * This prevents duplicate cron execution in multi-instance deployments without
 * requiring Redis or external infrastructure.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to acquire a lock for the given cron job.
   *
   * @param lockId  Unique identifier for the cron job (e.g. 'listings:autoStale')
   * @param ttlMs   How long the lock should be held, in milliseconds (default 5 min)
   * @returns `true` if this instance acquired the lock; `false` if another instance holds it.
   */
  async acquire(lockId: string, ttlMs = 5 * 60 * 1000): Promise<boolean> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
      // Atomic: insert the lock row if it doesn't exist, or update it only
      // if the existing lock has expired (lockedUntil < now).
      // Returns the number of rows affected (0 or 1).
      const result: [{ cnt: bigint }] = await this.prisma.$queryRaw`
        INSERT INTO cron_locks (id, "lockedAt", "lockedUntil")
        VALUES (${lockId}, ${now}, ${lockedUntil})
        ON CONFLICT (id) DO UPDATE
          SET "lockedAt" = ${now},
              "lockedUntil" = ${lockedUntil}
          WHERE cron_locks."lockedUntil" < ${now}
        RETURNING (SELECT COUNT(*)) as cnt
      `;

      // If the INSERT/UPDATE returned a row, we got the lock
      const acquired = result.length > 0;

      if (!acquired) {
        this.logger.debug(`Lock "${lockId}" held by another instance — skipping`);
      }

      return acquired;
    } catch (err) {
      // On error (e.g. table doesn't exist yet), log and allow the job to run
      // so that single-instance deployments aren't blocked.
      this.logger.warn(
        `Failed to acquire cron lock "${lockId}": ${String(err).slice(0, 200)}`,
      );
      return true;
    }
  }

  /**
   * Release a lock early (optional — locks auto-expire via TTL).
   * Call this when the cron job finishes sooner than the TTL.
   */
  async release(lockId: string): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        DELETE FROM cron_locks WHERE id = ${lockId}
      `;
    } catch (err) {
      this.logger.warn(
        `Failed to release cron lock "${lockId}": ${String(err).slice(0, 200)}`,
      );
    }
  }
}
