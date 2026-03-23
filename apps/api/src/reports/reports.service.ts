import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    // Validate target exists
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
      });
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }
    }

    // Prevent duplicate pending reports from same user on same target
    const duplicate = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: 'PENDING',
      },
    });
    if (duplicate) {
      throw new BadRequestException('Você já denunciou este conteúdo');
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

    // Create a notification for admin about the new report
    try {
      await this.prisma.notification.create({
        data: {
          userId: reporterId,
          type: 'ADMIN_REPORT',
          title: `Nova denúncia: ${dto.reason}`,
          body: `Denúncia de ${dto.targetType} (${dto.targetId}): ${(dto.description || 'Sem descrição').slice(0, 200)}`,
          data: JSON.stringify({
            reportId: report.id,
            targetType: dto.targetType,
            targetId: dto.targetId,
            reason: dto.reason,
          }),
        },
      });
    } catch {
      // Non-critical: notification creation failure should not block report
    }

    return report;
  }

  async getUserReports(userId: string) {
    return this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
