import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';
import { ResolveReportDto, ResolveAction } from './dto/resolve-report.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

  constructor(
    private prisma: PrismaService,
    private listings: ListingsService,
    private auditLog: AuditLogService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    // Validate target exists for each supported type
    if (dto.targetType === ReportTargetType.LISTING) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: dto.targetId },
      });
      if (!listing || listing.status === 'DELETED') {
        throw new NotFoundException('Anúncio não encontrado');
      }
    } else if (dto.targetType === ReportTargetType.USER) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) {
        throw new NotFoundException('Usuário não encontrado');
      }
      if (user.id === reporterId) {
        throw new BadRequestException('Você não pode denunciar a si mesmo');
      }
    } else if (dto.targetType === ReportTargetType.MESSAGE) {
      const msg = await this.prisma.message.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!msg) throw new NotFoundException('Mensagem não encontrada');
    } else if (dto.targetType === ReportTargetType.REVIEW) {
      const rev = await this.prisma.review.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!rev) throw new NotFoundException('Avaliação não encontrada');
    }

    // Reject duplicate report (same reporter + target) within 24h
    const since = new Date(Date.now() - this.DEDUPE_WINDOW_MS);
    const duplicate = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        createdAt: { gte: since },
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Você já denunciou este conteúdo nas últimas 24 horas. Nossa equipe está analisando.',
      );
    }

    // Per-target DoS guard (pen-test deferred follow-up). The per-
    // reporter dedup above bounds a single attacker; the per-target
    // bucket bounds a COORDINATED attack across many reporters — 20
    // distinct reports on the same listing / user / message / review
    // in 24 h is the ceiling for organic outrage and the floor for
    // a brigading attempt. Above it, we refuse further reports on
    // this target with a generic "already under review" message;
    // the pending queue is already what admins need to triage.
    const PER_TARGET_REPORT_CAP = 20;
    const targetReportCount = await this.prisma.report.count({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        createdAt: { gte: since },
      },
    });
    if (targetReportCount >= PER_TARGET_REPORT_CAP) {
      // Neutral message — never tell the reporter they hit a cap
      // because doing so reveals exactly what the brigading budget
      // is. "Under review" is true AND uninformative.
      return {
        id: null,
        throttled: true,
        message:
          'Este conteúdo já está sob revisão da nossa equipe. Obrigado pela denúncia.',
      };
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
        status: 'PENDING',
      },
    });

    // Notify admins (non-blocking)
    this.notifyAdmins(report.id, dto).catch((e) =>
      this.logger.warn(
        `Falha ao notificar admins: ${String(e).slice(0, 200)}`,
      ),
    );

    return {
      ...report,
      message:
        'Denúncia recebida. Nossa equipe de moderação responde em até 24 horas úteis.',
    };
  }

  private async notifyAdmins(reportId: string, dto: CreateReportDto) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isBanned: false, deletedAt: null },
      select: { id: true },
    });
    const data = {
      reportId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
    };
    await Promise.all(
      admins.map((admin) =>
        this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'ADMIN_REPORT',
            title: `Nova denúncia: ${dto.reason}`,
            body: `Denúncia de ${dto.targetType}: ${(
              dto.description || 'Sem descrição'
            ).slice(0, 200)}`,
            data,
          },
        }),
      ),
    );
  }

  async getUserReports(userId: string) {
    return this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Admin endpoints ---

  async listReportsAdmin(
    page: number,
    pageSize: number,
    status?: string,
    targetType?: string,
  ) {
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (targetType) where.targetType = targetType;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async resolveReportAdmin(
    reportId: string,
    adminId: string,
    dto: ResolveReportDto,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Denúncia não encontrada');
    if (report.status !== 'PENDING') {
      throw new BadRequestException('Esta denúncia já foi revisada');
    }

    const newStatus =
      dto.action === ResolveAction.DISMISS ? 'REVIEWED' : 'RESOLVED';

    // Optionally hide the target
    if (dto.action === ResolveAction.RESOLVE && dto.hideTarget) {
      if (report.targetType === 'listing') {
        await this.prisma.listing
          .update({
            where: { id: report.targetId },
            data: { status: 'DELETED' },
          })
          .catch(() => undefined);
        // Drop the hidden listing from search.
        this.listings.syncSearchIndex(report.targetId).catch(() => {});
      } else if (report.targetType === 'user') {
        await this.prisma.user
          .update({
            where: { id: report.targetId },
            data: {
              isBanned: true,
              bannedAt: new Date(),
              bannedReason: `Banido por moderação: ${dto.note?.slice(0, 200) ?? report.reason}`,
            },
          })
          .catch(() => undefined);
      } else if (report.targetType === 'message') {
        // Soft-delete: blank body. Hard-delete would break receipts.
        await this.prisma.message
          .update({
            where: { id: report.targetId },
            data: { body: '[Mensagem removida pela moderação]' },
          })
          .catch(() => undefined);
      }
    }

    const resolved = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: newStatus,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });
    await this.auditLog.record({
      actorId: adminId,
      action: `report.${dto.action === ResolveAction.DISMISS ? 'dismiss' : 'resolve'}`,
      targetType: 'report',
      targetId: reportId,
      metadata: {
        targetType: report.targetType,
        targetId: report.targetId,
        hidTarget: Boolean(dto.action === ResolveAction.RESOLVE && dto.hideTarget),
      },
    });
    return resolved;
  }
}
