import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service';
import { CronLockService } from '../services/cron-lock.service';
import { assertSafeS3Endpoint } from '../services/url-validator';

/**
 * Retention + orphan-reaper crons. One service, one log stream, so ops
 * has a single place to tail when auditing deletion activity. All
 * purges are idempotent (deleteMany with a time cutoff) and tolerant
 * of partial failures — each tick processes as many rows as possible
 * and logs anomalies without bailing the whole run.
 *
 * Retention windows come from env so the DPO can retune without a
 * deploy. Defaults match docs/privacy/ripd.md §5.
 *
 *   LoginEvent            → RETENTION_LOGIN_EVENT_DAYS            (90d)
 *   ProcessedWebhook      → RETENTION_PROCESSED_WEBHOOK_DAYS      (30d)
 *   ListingImageFlag      → RETENTION_LISTING_IMAGE_FLAG_DAYS     (365d)
 *   FraudFlag             → RETENTION_FRAUD_FLAG_DAYS             (365d)
 *   S3 orphan images      → ORPHAN_IMAGE_SWEEP_DAYS               (30d)
 */
@Injectable()
export class RetentionCronService {
  private readonly logger = new Logger(RetentionCronService.name);

  private readonly loginEventDays: number;
  private readonly processedWebhookDays: number;
  private readonly listingImageFlagDays: number;
  private readonly fraudFlagDays: number;
  private readonly orphanImageDays: number;

  private readonly s3: S3Client | null;
  private readonly s3Bucket: string;
  private readonly s3Configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
    private readonly config: ConfigService,
  ) {
    this.loginEventDays = this.readDays('RETENTION_LOGIN_EVENT_DAYS', 90);
    this.processedWebhookDays = this.readDays('RETENTION_PROCESSED_WEBHOOK_DAYS', 30);
    this.listingImageFlagDays = this.readDays('RETENTION_LISTING_IMAGE_FLAG_DAYS', 365);
    this.fraudFlagDays = this.readDays('RETENTION_FRAUD_FLAG_DAYS', 365);
    this.orphanImageDays = this.readDays('ORPHAN_IMAGE_SWEEP_DAYS', 30);

    // S3 client mirrors the one in UploadsService — duplicated
    // deliberately so this cron module stays import-free of the
    // uploads module (which would create a dependency cycle via
    // ListingsService → ... → UploadsService).
    const endpoint = this.config.get<string>('S3_ENDPOINT', '');
    assertSafeS3Endpoint(endpoint);
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', '');
    this.s3Bucket = this.config.get<string>('S3_BUCKET', 'vintage-uploads');
    const explicitRegion = this.config.get<string>('S3_REGION', '');
    const isR2 = /\.r2\.cloudflarestorage\.com$/i.test(
      (() => {
        try {
          return endpoint ? new URL(endpoint).hostname : '';
        } catch {
          return '';
        }
      })(),
    );
    const region = explicitRegion || (isR2 ? 'auto' : 'us-east-1');

    this.s3Configured = !!(accessKeyId && secretAccessKey && this.s3Bucket !== 'vintage-uploads');

    this.s3 = this.s3Configured
      ? new S3Client({
          region,
          credentials: { accessKeyId, secretAccessKey },
          ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        })
      : null;
  }

  private readDays(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  /**
   * Daily at 02:00 — DB-only purges. Each table runs independently so
   * a transient failure on one (e.g. schema migration in flight) doesn't
   * block the others.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeRetainedRows() {
    if (!(await this.cronLock.acquire('retention:daily'))) return;

    await this.purgeTable(
      'LoginEvent',
      this.loginEventDays,
      (cutoff) => this.prisma.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    );

    await this.purgeTable(
      'ProcessedWebhook',
      this.processedWebhookDays,
      (cutoff) =>
        this.prisma.processedWebhook.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
    );

    // Flag tables: keep PENDING forever (those still need admin action)
    // and only purge resolved rows past retention. Purging a PENDING
    // flag would silently drop a fraud / moderation signal an admin
    // never got to review.
    await this.purgeTable(
      'ListingImageFlag',
      this.listingImageFlagDays,
      (cutoff) =>
        this.prisma.listingImageFlag.deleteMany({
          where: { createdAt: { lt: cutoff }, status: { not: 'PENDING' } },
        }),
    );

    await this.purgeTable(
      'FraudFlag',
      this.fraudFlagDays,
      (cutoff) =>
        this.prisma.fraudFlag.deleteMany({
          where: { createdAt: { lt: cutoff }, status: { not: 'PENDING' } },
        }),
    );
  }

  /**
   * Daily at 05:00 — S3 orphan sweep. Decoupled from the DB purges
   * above because S3 outages shouldn't delay the DB-only work, and
   * DB outages shouldn't waste S3 quota.
   *
   * Sweep rules:
   *   1. Only touch Listings with status='DELETED' older than cutoff.
   *   2. Skip when ANY OrderListingSnapshot still references the
   *      listingId — the snapshot imageUrls point at the same S3 keys
   *      (option-B freeze, see schema.prisma OrderListingSnapshot
   *      comment). Once every order lifecycle terminates and purges
   *      the snapshot, this listing becomes eligible.
   *   3. Issue DeleteObject per image key parsed from the stored URL.
   *      Failures log-and-continue — a 404 on one key doesn't block
   *      the listing's eventual hard-delete.
   *   4. Hard-delete the Listing row; cascade removes ListingImage.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async sweepOrphanImages() {
    if (!(await this.cronLock.acquire('retention:s3-orphan-sweep'))) return;
    if (!this.s3Configured || !this.s3) {
      this.logger.warn(
        'S3 orphan sweep skipped: storage not configured (dev mode).',
      );
      return;
    }

    const cutoff = new Date(Date.now() - this.orphanImageDays * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.listing.findMany({
      where: { status: 'DELETED', updatedAt: { lt: cutoff } },
      select: { id: true, images: { select: { id: true, url: true } } },
      take: 500, // cap per tick
    });

    if (candidates.length === 0) return;

    let reaped = 0;
    let skipped = 0;

    for (const listing of candidates) {
      // Belt-and-braces — never reap while a snapshot still references it.
      const snapshotRefs = await this.prisma.orderListingSnapshot.count({
        where: { listingId: listing.id },
      });
      if (snapshotRefs > 0) {
        skipped += 1;
        continue;
      }

      for (const img of listing.images) {
        const key = this.extractS3Key(img.url);
        if (!key) {
          this.logger.warn(
            `orphan sweep: could not parse S3 key from URL on image ${img.id}`,
          );
          continue;
        }
        try {
          await this.s3.send(
            new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: key }),
          );
        } catch (err) {
          // A 404 / NoSuchKey is fine (maybe a previous sweep already
          // cleared it). Anything else we log but keep sweeping.
          this.logger.warn(
            `orphan sweep: DeleteObject failed for key ${key} on listing ${listing.id}: ${String(err).slice(0, 200)}`,
          );
        }
      }

      try {
        await this.prisma.listing.delete({ where: { id: listing.id } });
        reaped += 1;
      } catch (err) {
        // If a new order sneaks in between the findMany and the
        // delete (race with a cron from orders-cron re-activating
        // the listing on auto-cancel), the FK constraint will
        // refuse. That's fine — we skip and pick it up next tick.
        this.logger.warn(
          `orphan sweep: could not hard-delete listing ${listing.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }

    this.logger.log(
      `orphan sweep: reaped ${reaped} DELETED listings, skipped ${skipped} with active snapshots (cutoff ${this.orphanImageDays}d)`,
    );
  }

  /**
   * Extract the S3 key from a stored image URL. Handles both
   * virtual-hosted-style (`https://<bucket>.s3.<region>.amazonaws.com/<key>`)
   * and R2-style (`https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`)
   * URLs. Presigned query strings are dropped by `new URL` parsing.
   *
   * Returns null when the URL is obviously not ours (picsum.photos
   * dev placeholders, external hosts).
   */
  private extractS3Key(urlString: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return null;
    }
    // Dev placeholder — not in S3 at all.
    if (parsed.hostname === 'picsum.photos') return null;

    const pathname = parsed.pathname.startsWith('/')
      ? parsed.pathname.slice(1)
      : parsed.pathname;

    // Virtual-hosted-style: bucket is in the hostname, path IS the key.
    // Path-style (R2): path is `<bucket>/<key>` — strip the bucket prefix.
    if (parsed.hostname.startsWith(`${this.s3Bucket}.`)) {
      return pathname;
    }
    if (pathname.startsWith(`${this.s3Bucket}/`)) {
      return pathname.slice(this.s3Bucket.length + 1);
    }
    // Fall back to path-as-key and let S3 404 if we guessed wrong.
    return pathname;
  }

  private async purgeTable(
    label: string,
    days: number,
    run: (cutoff: Date) => Promise<{ count: number }>,
  ) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const result = await run(cutoff);
      if (result.count > 0) {
        this.logger.log(
          `retention: purged ${result.count} ${label} rows older than ${days}d`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `retention: ${label} purge failed: ${String(err).slice(0, 200)}`,
      );
    }
  }
}
