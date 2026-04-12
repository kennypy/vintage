import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Days after which a listing with no activity is auto-paused */
const STALE_LISTING_DAYS = 90;

/** Days after which a paused listing is auto-deleted (soft) */
const PAUSED_CLEANUP_DAYS = 180;

@Injectable()
export class ListingsCronService {
  private readonly logger = new Logger(ListingsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Auto-pause ACTIVE listings that have had no updates in 90 days.
   * Notifies the seller so they can re-activate if desired.
   * Runs daily at 03:00.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoStaleListings() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_LISTING_DAYS);

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
      `Auto-pausing ${staleListings.length} stale listings (>${STALE_LISTING_DAYS} days without update)`,
    );

    for (const listing of staleListings) {
      try {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: 'PAUSED' },
        });

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
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PAUSED_CLEANUP_DAYS);

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
      `Removing ${oldPausedListings.length} paused listings (>${PAUSED_CLEANUP_DAYS} days)`,
    );

    for (const listing of oldPausedListings) {
      try {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: 'DELETED' },
        });
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
