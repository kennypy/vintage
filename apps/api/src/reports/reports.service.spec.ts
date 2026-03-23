import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportTargetType } from './dto/create-report.dto';

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
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('createReport', () => {
    it('should create a report for a listing target', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'ACTIVE' });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.LISTING,
        targetId: 'listing-1',
        reason: 'counterfeit' as any,
        description: 'Produto falso',
      });

      expect(result.reporterId).toBe('reporter-1');
      expect(result.targetType).toBe('listing');
      expect(result.targetId).toBe('listing-1');
      expect(result.status).toBe('pending');
    });

    it('should create a report for a user target', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Test' });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.USER,
        targetId: 'user-1',
        reason: 'harassment' as any,
      });

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
      mockPrisma.notification.create.mockResolvedValue({});

      // Create first report
      await service.createReport('reporter-1', {
        targetType: ReportTargetType.LISTING,
        targetId: 'listing-1',
        reason: 'spam' as any,
      });

      // Try to create duplicate
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
      mockPrisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'ACTIVE' });
      mockPrisma.notification.create.mockResolvedValue({});

      await service.createReport('user-1', {
        targetType: ReportTargetType.LISTING,
        targetId: 'listing-1',
        reason: 'spam' as any,
      });

      const result = await service.getUserReports('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].reporterId).toBe('user-1');
    });

    it('should return empty array for user with no reports', async () => {
      const result = await service.getUserReports('user-with-no-reports');

      expect(result).toEqual([]);
    });
  });
});
