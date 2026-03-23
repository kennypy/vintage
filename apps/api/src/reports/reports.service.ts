import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';

// TODO: Add a Report model to Prisma schema with fields:
// id, reporterId, targetType, targetId, reason, description, status, createdAt, updatedAt
// For now, reports are stored in-memory.

export interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
}

@Injectable()
export class ReportsService {
  // TODO: Replace in-memory store with Prisma Report model
  private reports: Report[] = [];
  private idCounter = 0;

  constructor(private prisma: PrismaService) {}

  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
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

    // Prevent duplicate reports from same user on same target
    const duplicate = this.reports.find(
      (r) =>
        r.reporterId === reporterId &&
        r.targetType === dto.targetType &&
        r.targetId === dto.targetId &&
        r.status === 'pending',
    );
    if (duplicate) {
      throw new BadRequestException('Você já denunciou este conteúdo');
    }

    this.idCounter++;
    const report: Report = {
      id: `report_${this.idCounter}`,
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      description: dto.description,
      status: 'pending',
      createdAt: new Date(),
    };

    this.reports.push(report);

    // Create a notification for admin about the new report
    // Using type 'ADMIN_REPORT' to flag it for the admin dashboard
    try {
      await this.prisma.notification.create({
        data: {
          userId: reporterId, // Stored on reporter; admin dashboard should query by type
          type: 'ADMIN_REPORT',
          title: `Nova denúncia: ${dto.reason}`,
          body: `Denúncia de ${dto.targetType} (${dto.targetId}): ${dto.description || 'Sem descrição'}`,
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

  async getUserReports(userId: string): Promise<Report[]> {
    return this.reports.filter((r) => r.reporterId === userId);
  }
}
