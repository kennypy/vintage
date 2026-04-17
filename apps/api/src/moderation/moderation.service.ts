import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ReviewAction = 'SUSPEND_LISTING' | 'BAN_USER' | 'DISMISS';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

    return { unsuspended: true, listingId };
  }

  async banUser(userId: string, adminId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.isBanned) throw new BadRequestException('Usuário já está banido');

    // Ban the user and suspend all their active listings in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: String(reason).slice(0, 500),
        },
      });

      await tx.listing.updateMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
    });

    return { banned: true, userId };
  }

  async unbanUser(userId: string) {
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

    return { unbanned: true, userId };
  }
}
