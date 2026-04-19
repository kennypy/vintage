import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingsService } from '../listings/listings.service';
import { FraudService } from '../fraud/fraud.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export type ReviewAction = 'SUSPEND_LISTING' | 'BAN_USER' | 'DISMISS';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly listings: ListingsService,
    private readonly fraud: FraudService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listPendingReports(page = 1, pageSize = 20, targetType?: string) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const where = {
      status: 'PENDING' as const,
      ...(targetType ? { targetType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { reporter: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async reviewReport(reportId: string, action: ReviewAction, adminId: string, note?: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Denúncia não encontrada');
    if (report.status !== 'PENDING') {
      throw new BadRequestException('Esta denúncia já foi revisada');
    }

    switch (action) {
      case 'SUSPEND_LISTING':
        if (report.targetType !== 'listing') {
          throw new BadRequestException('Ação inválida para este tipo de denúncia');
        }
        await this.suspendListing(report.targetId, adminId, note ?? report.reason);
        break;
      case 'BAN_USER':
        if (report.targetType !== 'user') {
          throw new BadRequestException('Ação inválida para este tipo de denúncia');
        }
        await this.banUser(report.targetId, adminId, note ?? report.reason);
        break;
      case 'DISMISS':
        break;
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: 'REVIEWED' },
    });
  }

  async suspendListing(listingId: string, adminId: string, reason: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, sellerId: true, title: true },
    });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.status === 'DELETED') throw new BadRequestException('Anúncio já foi removido');

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'SUSPENDED' },
    });

    // Drop from search — SUSPENDED must not surface in buyer queries.
    this.listings.syncSearchIndex(listingId).catch(() => {});

    // Notify seller (non-critical)
    this.notifications.createNotification(
      listing.sellerId,
      'LISTING_SUSPENDED',
      'Anúncio suspenso',
      `Seu anúncio "${listing.title.slice(0, 60)}" foi suspenso por violação das políticas da plataforma.`,
      { listingId, reason: String(reason).slice(0, 200), adminId },
    ).catch(() => {/* non-critical */});

    return { suspended: true, listingId };
  }

  async unsuspendListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.status !== 'SUSPENDED') {
      throw new BadRequestException('Anúncio não está suspenso');
    }

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'ACTIVE' },
    });

    // Re-add to search now that it's ACTIVE again.
    this.listings.syncSearchIndex(listingId).catch(() => {});

    return { unsuspended: true, listingId };
  }

  async banUser(userId: string, adminId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.isBanned) throw new BadRequestException('Usuário já está banido');

    // Collect affected listings before the updateMany so we know which
    // docs to drop from search afterwards.
    const suspendedIds = await this.prisma.listing.findMany({
      where: { sellerId: userId, status: 'ACTIVE' },
      select: { id: true },
    });

    // Ban the user and suspend all their active listings in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: String(reason).slice(0, 500),
          // Bump tokenVersion so any outstanding JWTs die immediately.
          // JwtStrategy already throws on isBanned=true, but the ver bump
          // is defense-in-depth: if the ban flow ever gets split across
          // service boundaries or the isBanned read comes from a cache,
          // the ver check still catches the stale token.
          tokenVersion: { increment: 1 },
        },
      });

      await tx.listing.updateMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
    });

    // Drop every newly-suspended listing from search. syncSearchIndex
    // re-reads the row and removes it since status !== ACTIVE.
    for (const { id } of suspendedIds) {
      this.listings.syncSearchIndex(id).catch(() => {});
    }

    await this.auditLog.record({
      actorId: adminId,
      action: 'user.ban',
      targetType: 'user',
      targetId: userId,
      metadata: {
        reason: String(reason).slice(0, 200),
        listingsSuspended: suspendedIds.length,
      },
    });

    return { banned: true, userId };
  }

  async unbanUser(userId: string, adminId: string | null = null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.isBanned) throw new BadRequestException('Usuário não está banido');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, bannedAt: null, bannedReason: null },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: 'user.unban',
      targetType: 'user',
      targetId: userId,
    });

    return { unbanned: true, userId };
  }

  /**
   * Force-logout a user without banning them. Bumps tokenVersion so every
   * outstanding JWT (access + refresh) issued before this call is
   * rejected on the next request. Used when support suspects a session
   * is compromised but doesn't want to suspend the account itself.
   */
  async forceLogout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true, userId };
  }

  // --- Image Flag queue (SafeSearch LIKELY hits on uploads) ---
  //
  // ListingImageFlag rows are written by UploadsService when Google
  // Vision returns LIKELY on adult / violence / racy. VERY_LIKELY
  // uploads are refused at the boundary and never reach this table.

  async listPendingImageFlags(page = 1, pageSize = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where = { status: 'PENDING' as const };

    const [items, total] = await Promise.all([
      this.prisma.listingImageFlag.findMany({
        where,
        include: {
          uploader: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' }, // oldest-first FIFO triage
        skip,
        take: pageSize,
      }),
      this.prisma.listingImageFlag.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  /**
   * Resolve a pending flag. On REJECT we also delete any ListingImage
   * row that points at the same URL and soft-delete the listing; the
   * S3 object is deleted via a separate cron (not the controller,
   * to avoid a permission surface on the admin token).
   */
  async resolveImageFlag(
    flagId: string,
    action: 'DISMISS' | 'REJECT',
    adminId: string,
    note?: string,
  ) {
    const flag = await this.prisma.listingImageFlag.findUnique({
      where: { id: flagId },
    });
    if (!flag) throw new NotFoundException('Sinalização não encontrada');
    if (flag.status !== 'PENDING') {
      throw new BadRequestException('Esta sinalização já foi resolvida');
    }

    const nextStatus = action === 'DISMISS' ? 'DISMISSED' : 'REJECTED';
    let suspendedListingIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.listingImageFlag.update({
        where: { id: flagId },
        data: {
          status: nextStatus,
          reviewedById: adminId,
          reviewedAt: new Date(),
          reviewNote: note?.slice(0, 500) ?? null,
        },
      });

      if (action === 'REJECT') {
        // Remove the image row from any listing that ended up using
        // this URL, and suspend the parent listing so the remaining
        // images don't keep the now-offending listing live.
        const images = await tx.listingImage.findMany({
          where: { url: flag.imageUrl },
          select: { id: true, listingId: true },
        });
        suspendedListingIds = [...new Set(images.map((i) => i.listingId))];
        if (images.length > 0) {
          await tx.listingImage.deleteMany({
            where: { id: { in: images.map((i) => i.id) } },
          });
        }
        if (suspendedListingIds.length > 0) {
          await tx.listing.updateMany({
            where: { id: { in: suspendedListingIds } },
            data: { status: 'SUSPENDED' },
          });
        }
      }
    });

    // Post-tx: drop the now-SUSPENDED listings from Meilisearch so
    // buyers stop seeing them in search results.
    for (const id of suspendedListingIds) {
      this.listings.syncSearchIndex(id).catch(() => {});
    }

    this.logger.log(
      `ListingImageFlag ${flagId} resolved as ${nextStatus} by ${adminId}`,
    );

    return { resolved: true, status: nextStatus };
  }

  // --- Fraud flag triage (thin passthrough to FraudService) ---
  //
  // The admin UI for fraud sits alongside image-flag and report
  // triage under /moderation, so the controller endpoints live here
  // and forward to FraudService. Keeps admin triage surface
  // unified — ops doesn't need to learn a new sub-tree.

  listPendingFraudFlags(page?: number, pageSize?: number) {
    return this.fraud.listPendingFlags(page, pageSize);
  }

  resolveFraudFlag(
    flagId: string,
    action: 'DISMISS' | 'REVIEWED',
    adminId: string,
    note?: string,
  ) {
    return this.fraud.resolveFlag(flagId, action, adminId, note);
  }
}
