import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { ReportTargetType } from './dto/create-report.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockPrisma = {
  listing: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
  report: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ListingsService,
          useValue: { syncSearchIndex: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('createReport', () => {
    it('should create a report for a listing target', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'ACTIVE' });
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.report.create.mockResolvedValue({
        id: 'report-1',
        reporterId: 'reporter-1',
        targetType: 'listing',
        targetId: 'listing-1',
        reason: 'counterfeit',
        description: 'Produto falso',
        status: 'PENDING',
        createdAt: new Date(),
      });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.LISTING,
        targetId: 'listing-1',
        reason: 'counterfeit' as any,
        description: 'Produto falso',
      });

      if ('throttled' in result) throw new Error('expected success branch');
      expect(result.reporterId).toBe('reporter-1');
      expect(result.targetType).toBe('listing');
      expect(result.targetId).toBe('listing-1');
      expect(result.status).toBe('PENDING');
      expect(mockPrisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reporterId: 'reporter-1',
          targetType: 'listing',
          targetId: 'listing-1',
        }),
      });
    });

    it('should create a report for a user target', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Test' });
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.report.create.mockResolvedValue({
        id: 'report-2',
        reporterId: 'reporter-1',
        targetType: 'user',
        targetId: 'user-1',
        reason: 'harassment',
        status: 'PENDING',
        createdAt: new Date(),
      });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.USER,
        targetId: 'user-1',
        reason: 'harassment' as any,
      });

      if ('throttled' in result) throw new Error('expected success branch');
      expect(result.reporterId).toBe('reporter-1');
      expect(result.targetType).toBe('user');
      expect(result.targetId).toBe('user-1');
    });

    it('should throw NotFoundException if listing target not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'nonexistent',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'nonexistent',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow('Anúncio não encontrado');
    });

    it('should throw NotFoundException if listing is DELETED', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'DELETED' });

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'listing-1',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'listing-1',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow('Anúncio não encontrado');
    });

    it('should throw NotFoundException if user target not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.USER,
          targetId: 'nonexistent',
          reason: 'harassment' as any,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.USER,
          targetId: 'nonexistent',
          reason: 'harassment' as any,
        }),
      ).rejects.toThrow('Usuário não encontrado');
    });

    it('should prevent duplicate pending reports from same user', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'ACTIVE' });
      mockPrisma.report.findFirst.mockResolvedValue({
        id: 'existing-report',
        reporterId: 'reporter-1',
        targetType: 'listing',
        targetId: 'listing-1',
        status: 'PENDING',
      });

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'listing-1',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.LISTING,
          targetId: 'listing-1',
          reason: 'spam' as any,
        }),
      ).rejects.toThrow('Você já denunciou este conteúdo');
    });
  });

  describe('getUserReports', () => {
    it('should return reports for the given user', async () => {
      const mockReports = [
        {
          id: 'report-1',
          reporterId: 'user-1',
          targetType: 'listing',
          targetId: 'listing-1',
          reason: 'spam',
          status: 'PENDING',
          createdAt: new Date(),
        },
      ];
      mockPrisma.report.findMany.mockResolvedValue(mockReports);

      const result = await service.getUserReports('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].reporterId).toBe('user-1');
      expect(mockPrisma.report.findMany).toHaveBeenCalledWith({
        where: { reporterId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array for user with no reports', async () => {
      mockPrisma.report.findMany.mockResolvedValue([]);

      const result = await service.getUserReports('user-with-no-reports');

      expect(result).toEqual([]);
    });
  });
});
