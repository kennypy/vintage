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
   * Fire "new items match your saved search" notifications once per day.
   * For each user with `notify = true` on a SavedSearch, look at listings
   * created in the last 24 hours that match the saved filter set, and
   * send a single aggregated push per matching saved search (up to a
   * hard cap to stay polite).
   *
   * Deliberate simplifications vs. the search endpoint:
   *   - The text `query` string is NOT matched here — running a real
   *     Meilisearch query per saved search per night is expensive for
   *     a marginal UX win. Users set text queries for exploration; we
   *     treat that as best-effort and lean on filters for the alert.
   *   - The window is strictly 24h. If the cron misses a day, those
   *     listings are lost for alerts — no backfill. Acceptable because
   *     saved-search is discovery, not audit.
   *
   * Runs daily at 09:00 (locale-friendly morning notification).
   */
  @Cron('0 9 * * *')
  async notifySavedSearchMatches() {
    if (!(await this.cronLock.acquire('listings:savedSearchMatches'))) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const savedSearches = await this.prisma.savedSearch.findMany({
      where: { notify: true },
      select: { id: true, userId: true, query: true, filtersJson: true },
      take: 2000,
    });
    if (savedSearches.length === 0) return;

    this.logger.log(`Checking ${savedSearches.length} saved searches for new matches`);

    for (const ss of savedSearches) {
      try {
        const filters = (ss.filtersJson ?? {}) as Record<string, unknown>;
        const where: Record<string, unknown> = {
          status: 'ACTIVE',
          createdAt: { gte: since },
        };
        if (typeof filters.categoryId === 'string') where.categoryId = filters.categoryId;
        if (typeof filters.brandId === 'string') where.brandId = filters.brandId;
        if (typeof filters.condition === 'string') where.condition = filters.condition;
        if (typeof filters.size === 'string') where.size = filters.size;
        if (typeof filters.minPrice === 'number' || typeof filters.maxPrice === 'number') {
          const priceBrl: Record<string, number> = {};
          if (typeof filters.minPrice === 'number') priceBrl.gte = filters.minPrice;
          if (typeof filters.maxPrice === 'number') priceBrl.lte = filters.maxPrice;
          where.priceBrl = priceBrl;
        }

        const matchCount = await this.prisma.listing.count({ where });
        if (matchCount === 0) continue;

        await this.notifications
          .createNotification(
            ss.userId,
            'SAVED_SEARCH_MATCH',
            'Novos itens na sua busca salva',
            matchCount === 1
              ? `Chegou 1 item novo que combina com "${ss.query}".`
              : `Chegaram ${matchCount} itens novos que combinam com "${ss.query}".`,
            { savedSearchId: ss.id, matchCount: String(matchCount) },
            // Vinted's "new items" card sits under the "Other" block —
            // same semantic as favourites (low-urgency discovery), so we
            // reuse the favourites toggle instead of adding a yet another
            // preference column.
            'favorites',
          )
          .catch(() => {
            /* per-user failure must not break the batch */
          });
      } catch (err) {
        this.logger.error(
          `Saved search ${ss.id} notification failed: ${String(err).slice(0, 200)}`,
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
