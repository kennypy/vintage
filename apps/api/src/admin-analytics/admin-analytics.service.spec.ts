import { Test, TestingModule } from '@nestjs/testing';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: { count: jest.fn() },
  listing: { count: jest.fn() },
  order: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminAnalyticsService>(AdminAnalyticsService);
  });

  describe('getOverview', () => {
    it('should return platform overview metrics', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(3); // bannedUsers
      mockPrisma.listing.count
        .mockResolvedValueOnce(500) // totalListings
        .mockResolvedValueOnce(350); // activeListings
      mockPrisma.order.count
        .mockResolvedValueOnce(200) // completedOrders
        .mockResolvedValueOnce(15); // pendingOrders
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalBrl: 50000 },
      });

      const result = await service.getOverview();

      expect(result.totalUsers).toBe(100);
      expect(result.bannedUsers).toBe(3);
      expect(result.totalListings).toBe(500);
      expect(result.activeListings).toBe(350);
      expect(result.completedOrders).toBe(200);
      expect(result.pendingOrders).toBe(15);
      expect(result.totalRevenueBrl).toBe(50000);
    });

    it('should handle zero revenue', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.listing.count.mockResolvedValue(0);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalBrl: null },
      });

      const result = await service.getOverview();

      expect(result.totalRevenueBrl).toBe(0);
    });
  });

  describe('getSalesByCategory', () => {
    it('should aggregate sales by category', async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      mockPrisma.order.findMany.mockResolvedValue([
        {
          itemPriceBrl: 100,
          createdAt: now,
          listing: {
            categoryId: 'cat-1',
            category: { namePt: 'Camisetas' },
            createdAt: weekAgo,
          },
        },
        {
          itemPriceBrl: 200,
          createdAt: now,
          listing: {
            categoryId: 'cat-1',
            category: { namePt: 'Camisetas' },
            createdAt: weekAgo,
          },
        },
      ]);

      const result = await service.getSalesByCategory();

      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Camisetas');
      expect(result[0].totalSales).toBe(2);
      expect(result[0].totalRevenueBrl).toBe(300);
      expect(result[0].avgPriceBrl).toBe(150);
    });
  });
});
