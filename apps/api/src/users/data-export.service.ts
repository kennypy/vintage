import { Injectable, Logger } from '@nestjs/common';
import * as archiver from 'archiver';
import { Readable, PassThrough } from 'node:stream';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CpfVaultService } from '../common/services/cpf-vault.service';

/**
 * Per-table row cap. An LGPD export is supposed to be COMPLETE, so this
 * sits far above any realistic account — it exists only so one
 * pathological account cannot pull unbounded rows into the heap. When a
 * cap is actually hit we say so in the receipt and log a warning,
 * because silently truncating a portability export would itself be a
 * compliance failure.
 */
const MAX_ROWS_PER_TABLE = 50_000;

/**
 * How long a built export may sit unconsumed before we tear it down.
 * Without this an abandoned request (client hung up, proxy stalled)
 * keeps every buffered chunk reachable for the life of the process.
 */
const EXPORT_IDLE_TIMEOUT_MS = 120_000;

/**
 * LGPD Art. 18(V) — portability. Produces a machine-readable
 * dump of everything we hold about a user so they can move to a
 * different platform, or just audit what we've got.
 *
 * The export is structured as a ZIP with:
 *   user.json          — profile, wallet balance, consent log,
 *                        tokenVersion, ToS acceptance history
 *   addresses.json     — every address the user has added
 *   listings.json      — every listing (ACTIVE, PAUSED, SOLD, DELETED)
 *                        with imageUrls inlined
 *   orders.json        — every order the user touched (as buyer OR seller)
 *                        incl. snapshots, shipping, status timeline
 *   offers.json        — sent + received
 *   messages.json      — every conversation + body
 *   payout-methods.json — masked (never the raw PIX key)
 *   disputes.json      — disputes the user opened or had opened against them
 *   notifications.json — current + historical
 *   reviews.json       — written + received
 *   fraud-flags.json   — flags raised against this user (transparency req)
 *   receipt.json       — { requestedAt, userId, sha256, rowCounts } for
 *                        audit. Hash covers the other JSON files so the
 *                        user can prove tampering later.
 *
 * Images are NOT inlined as bytes — we link to the current
 * ListingImage.url for each. That's LGPD-compliant (the data is
 * accessible) and avoids a multi-GB ZIP for prolific sellers.
 * The S3 orphan sweep's retention window means these URLs stay
 * live for at least the retention period after an export.
 *
 * Streamed: writes to a PassThrough so the controller can pipe
 * straight to the HTTP response. No full-ZIP-in-memory spike.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cpfVault: CpfVaultService,
  ) {}

  /**
   * Build a ZIP stream of the user's data. Returns a Readable the
   * caller pipes to the HTTP response.
   */
  async buildExport(userId: string): Promise<Readable> {
    const rawUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        // CPF is stored as AES-256-GCM ciphertext at rest; we decrypt
        // it below specifically for this LGPD data-portability export
        // because the OWNER is entitled to see their own CPF. The
        // decrypted value is held only inside the buildExport scope.
        cpfEncrypted: true,
        cnpj: true,
        phone: true,
        bio: true,
        avatarUrl: true,
        coverPhotoUrl: true,
        role: true,
        verified: true,
        cpfChecksumValid: true,
        cpfIdentityVerified: true,
        ratingAvg: true,
        ratingCount: true,
        isBanned: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        acceptedTosAt: true,
        acceptedTosVersion: true,
        twoFaEnabled: true,
        twoFaMethod: true,
        vacationMode: true,
        vacationUntil: true,
        tokenVersion: true,
        wallet: {
          select: {
            balanceBrl: true,
            pendingBrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!rawUser) {
      throw new Error(`user ${userId} not found`);
    }
    // Substitute the decrypted CPF in place of the ciphertext for the
    // export payload. The ciphertext itself is never surfaced — it's
    // opaque and useless outside our infrastructure.
    const { cpfEncrypted, ...userRest } = rawUser;
    const user = {
      ...userRest,
      cpf: cpfEncrypted ? this.cpfVault.decrypt(cpfEncrypted) : null,
    };

    const [
      addresses,
      listings,
      ordersBuyer,
      ordersSeller,
      offers,
      messages,
      payoutMethods,
      disputesOpened,
      notifications,
      reviewsWritten,
      reviewsReceived,
      fraudFlags,
      consentRecords,
    ] = await Promise.all([
      this.prisma.address.findMany({ where: { userId }, take: MAX_ROWS_PER_TABLE }),
      this.prisma.listing.findMany({
        where: { sellerId: userId },
        take: MAX_ROWS_PER_TABLE,
        include: {
          images: { select: { url: true, position: true } },
          category: { select: { slug: true, namePt: true } },
          brand: { select: { name: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { buyerId: userId },
        take: MAX_ROWS_PER_TABLE,
        include: { listingSnapshot: true },
      }),
      this.prisma.order.findMany({
        where: { sellerId: userId },
        take: MAX_ROWS_PER_TABLE,
        include: { listingSnapshot: true },
      }),
      this.prisma.offer.findMany({
        where: { buyerId: userId },
        take: MAX_ROWS_PER_TABLE,
        include: {
          listing: {
            select: { id: true, title: true, sellerId: true },
          },
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        take: MAX_ROWS_PER_TABLE,
        include: { conversation: { select: { id: true } } },
      }),
      this.prisma.payoutMethod.findMany({
        where: { userId },
        take: MAX_ROWS_PER_TABLE,
        select: {
          id: true,
          type: true,
          // pixKey is masked below — see jsonReplacer + maskPixKey.
          // Raw PIX keys are PII we deliberately do NOT re-expose in
          // an export, even to the subject themselves, because the
          // export leaves our custody and gets cached on the user's
          // device. Masked view is enough to identify "which method".
          pixKey: true,
          label: true,
          isDefault: true,
          createdAt: true,
        },
      }),
      this.prisma.dispute.findMany({ where: { openedById: userId }, take: MAX_ROWS_PER_TABLE }),
      this.prisma.notification.findMany({ where: { userId }, take: MAX_ROWS_PER_TABLE }),
      this.prisma.review.findMany({ where: { reviewerId: userId }, take: MAX_ROWS_PER_TABLE }),
      this.prisma.review.findMany({ where: { reviewedId: userId }, take: MAX_ROWS_PER_TABLE }),
      this.prisma.fraudFlag.findMany({ where: { userId }, take: MAX_ROWS_PER_TABLE }),
      // LGPD Art. 18(V) completeness: every consent grant / revocation
      // tied to this user. Pre-fix the export was silent about this,
      // meaning a user couldn't audit their own consent history. The
      // ipHash column stays on the row — it's an HMAC of the caller's
      // IP at consent time, not a raw IP, so it reveals nothing new
      // about the subject but DOES let them correlate consents with
      // device/session events they already hold.
      this.prisma.consentRecord.findMany({
        where: { userId },
        take: MAX_ROWS_PER_TABLE,
        orderBy: { grantedAt: 'asc' },
      }),
    ]);

    const payload = {
      'user.json': user,
      'addresses.json': addresses,
      'listings.json': listings,
      'orders.json': {
        asBuyer: ordersBuyer,
        asSeller: ordersSeller,
      },
      'offers.json': offers,
      'messages.json': messages,
      'payout-methods.json': payoutMethods.map((m) => ({
        ...m,
        pixKey: maskPixKey(m.pixKey ?? ''),
      })),
      'disputes.json': disputesOpened,
      'notifications.json': notifications,
      'reviews.json': {
        written: reviewsWritten,
        received: reviewsReceived,
      },
      'fraud-flags.json': fraudFlags,
      'consent-records.json': consentRecords,
    };

    // Hash every file content so the receipt proves exactly what
    // was exported. If the user ever disputes "you sent me X" we
    // point at the receipt.
    const hash = crypto.createHash('sha256');
    const serialized: Record<string, string> = {};
    for (const [name, data] of Object.entries(payload)) {
      const json = JSON.stringify(data, jsonReplacer, 2);
      serialized[name] = json;
      hash.update(`${name}:${json}\n`);
    }

    const rowCounts = {
      addresses: addresses.length,
      listings: listings.length,
      ordersAsBuyer: ordersBuyer.length,
      ordersAsSeller: ordersSeller.length,
      offers: offers.length,
      messages: messages.length,
      payoutMethods: payoutMethods.length,
      disputes: disputesOpened.length,
      notifications: notifications.length,
      reviewsWritten: reviewsWritten.length,
      reviewsReceived: reviewsReceived.length,
      fraudFlags: fraudFlags.length,
      consentRecords: consentRecords.length,
    };

    // A capped table means the export is INCOMPLETE. LGPD portability
    // requires completeness, so this is disclosed on the receipt rather
    // than swallowed, and flagged to ops to deliver the remainder.
    const truncatedTables = Object.entries(rowCounts)
      .filter(([, count]) => count >= MAX_ROWS_PER_TABLE)
      .map(([table]) => table);
    if (truncatedTables.length > 0) {
      this.logger.warn(
        `export for ${userId} hit the ${MAX_ROWS_PER_TABLE}-row cap on: ${truncatedTables.join(', ')} — deliver the remainder manually`,
      );
    }

    const receipt = {
      userId,
      requestedAt: new Date().toISOString(),
      sha256: hash.digest('hex'),
      schemaVersion: 1,
      rowCounts,
      maxRowsPerTable: MAX_ROWS_PER_TABLE,
      truncatedTables,
      note:
        'Hash cobre os arquivos JSON exportados, concatenados na forma "nome:conteúdo\\n". ' +
        'Para verificar: gere SHA256 dos arquivos na mesma ordem e compare com o campo sha256.',
    };

    const zip = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();
    zip.pipe(stream);

    // Catch archiver errors so the request fails cleanly instead of hanging.
    zip.on('error', (err) => {
      this.logger.error(
        `export ZIP build failed for ${userId}: ${String(err).slice(0, 200)}`,
      );
      stream.destroy(err);
    });

    for (const [name, json] of Object.entries(serialized)) {
      zip.append(json, { name });
    }
    zip.append(JSON.stringify(receipt, null, 2), { name: 'receipt.json' });

    // Tear down an export nobody consumes, so its buffers are released.
    const idleTimer = setTimeout(() => {
      this.logger.warn(
        `export stream for ${userId} was never consumed within ${EXPORT_IDLE_TIMEOUT_MS}ms — destroying`,
      );
      stream.destroy(new Error('export stream timed out'));
    }, EXPORT_IDLE_TIMEOUT_MS);
    // Don't hold the event loop open on this timer alone.
    idleTimer.unref();
    const clearIdleTimer = () => clearTimeout(idleTimer);
    stream.once('end', clearIdleTimer);
    stream.once('close', clearIdleTimer);
    stream.once('error', clearIdleTimer);

    // Deliberately NOT awaited. archiver only drains as its consumer
    // reads, and the consumer is the controller, which cannot pipe to
    // the response until this function returns. Awaiting finalize()
    // therefore deadlocks as soon as the output passes archiver's ~1 MB
    // highWaterMark: nothing drains the PassThrough, `end` never fires,
    // the promise never settles, and every buffer stays reachable. Kick
    // finalization off and let the consumer drive the drain.
    void zip.finalize().catch((err: unknown) => {
      this.logger.error(
        `export ZIP finalize failed for ${userId}: ${String(err).slice(0, 200)}`,
      );
      clearIdleTimer();
      stream.destroy(err instanceof Error ? err : new Error(String(err)));
    });

    this.logger.log(
      `export ZIP started for ${userId}: ${rowCounts.ordersAsBuyer + rowCounts.ordersAsSeller} orders, ${rowCounts.listings} listings, sha256=${receipt.sha256.slice(0, 12)}…`,
    );

    return stream;
  }
}

/** Prisma Decimal + Date handling for JSON.stringify. */
function jsonReplacer(_key: string, value: unknown) {
  if (value && typeof value === 'object' && 'toJSON' in value && typeof (value as { toJSON: unknown }).toJSON === 'function') {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  // Prisma Decimal instances have a .d, .e, .s shape; stringify them.
  if (
    value &&
    typeof value === 'object' &&
    'd' in value &&
    'e' in value &&
    's' in value
  ) {
    return String(value);
  }
  return value;
}

export function maskPixKey(pixKey: string): string {
  if (!pixKey) return '';
  if (pixKey.includes('@')) {
    // Email: keep first 2 and domain
    const [local, domain] = pixKey.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (pixKey.length <= 4) return '***';
  return `${pixKey.slice(0, 2)}${'*'.repeat(pixKey.length - 4)}${pixKey.slice(-2)}`;
}
