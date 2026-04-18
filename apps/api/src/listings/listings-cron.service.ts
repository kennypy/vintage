import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class ListingsCronService {
  private readonly logger = new Logger(ListingsCronService.name);

  /** Days after which a listing with no activity is auto-paused */
  private readonly staleListingDays: number;

  /** Days after which a paused listing is auto-deleted (soft) */
  private readonly pausedCleanupDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly cronLock: CronLockService,
    private readonly search: SearchService,
  ) {
    this.staleListingDays = this.config.get<number>('STALE_LISTING_DAYS', 90);
    this.pausedCleanupDays = this.config.get<number>('PAUSED_CLEANUP_DAYS', 180);
  }

  /**
   * Auto-pause ACTIVE listings that have had no updates in 90 days.
   * Notifies the seller so they can re-activate if desired.
   * Runs daily at 03:00.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoStaleListings() {
    if (!(await this.cronLock.acquire('listings:autoStale'))) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.staleListingDays);

    const staleListings = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: { lt: cutoff },
      },
      select: { id: true, title: true, sellerId: true },
      take: 500,
    });

    if (staleListings.length === 0) return;

    this.logger.log(
      `Auto-pausing ${staleListings.length} stale listings (>${this.staleListingDays} days without update)`,
    );

    for (const listing of staleListings) {
      try {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: 'PAUSED' },
        });

        // Drop from search — PAUSED listings must not appear in results.
        this.search.removeListing(listing.id).catch(() => {});

        await this.notifications
          .createNotification(
            listing.sellerId,
            'system',
            'Anúncio pausado automaticamente',
            `Seu anúncio "${listing.title}" foi pausado por inatividade. Acesse "Meus anúncios" para reativar.`,
            { listingId: listing.id },
          )
          .catch(() => {});
      } catch (err) {
        this.logger.error(
          `Failed to auto-pause listing ${listing.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Remove (soft-delete) PAUSED listings that have been paused for over 180 days.
   * Runs daily at 04:00.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupPausedListings() {
    if (!(await this.cronLock.acquire('listings:cleanupPaused'))) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.pausedCleanupDays);

    const oldPausedListings = await this.prisma.listing.findMany({
      where: {
        status: 'PAUSED',
        updatedAt: { lt: cutoff },
      },
      select: { id: true, title: true, sellerId: true },
      take: 500,
    });

    if (oldPausedListings.length === 0) return;

    this.logger.log(
      `Removing ${oldPausedListings.length} paused listings (>${this.pausedCleanupDays} days)`,
    );

    for (const listing of oldPausedListings) {
      try {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: 'DELETED' },
        });

        // Belt-and-braces: PAUSED listings should already be absent
        // from the index, but a failed earlier sync could leave a
        // stale doc behind. Issue the remove idempotently.
        this.search.removeListing(listing.id).catch(() => {});
      } catch (err) {
        this.logger.error(
          `Failed to clean up listing ${listing.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Expire active promotions whose endsAt has passed.
   * Resets promotedUntil on the listing.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expirePromotions() {
    if (!(await this.cronLock.acquire('listings:expirePromotions'))) return;

    const now = new Date();

    const expired = await this.prisma.listing.findMany({
      where: {
        promotedUntil: { lt: now, not: null },
        status: 'ACTIVE',
      },
      select: { id: true },
      take: 1000,
    });

    if (expired.length === 0) return;

    await this.prisma.listing.updateMany({
      where: { id: { in: expired.map((l) => l.id) } },
      data: { promotedUntil: null },
    });

    this.logger.log(`Expired promotions on ${expired.length} listings`);
  }
}
