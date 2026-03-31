import { Test, TestingModule } from '@nestjs/testing';
import { AudienceService, MIN_COHORT_SIZE } from './audience.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  userEvent: {
    findMany: jest.fn(),
  },
  userAdProfile: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('AudienceService', () => {
  let service: AudienceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudienceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AudienceService>(AudienceService);
    jest.clearAllMocks();
  });

  describe('computeProfile', () => {
    it('upserts profile from events', async () => {
      mockPrisma.userEvent.findMany.mockResolvedValue([
        {
          eventType: 'LISTING_VIEW',
          entityType: 'category',
          entityId: 'cat-1',
          metadata: { priceBrl: 50, size: 'M', color: 'preto' },
          createdAt: new Date(),
        },
        {
          eventType: 'LISTING_FAVORITE',
          entityType: 'brand',
          entityId: 'brand-1',
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      mockPrisma.userAdProfile.upsert.mockResolvedValue({});
      await service.computeProfile('user-1');
      expect(mockPrisma.userAdProfile.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.userAdProfile.upsert.mock.calls[0][0];
      expect(call.create.categoryScores['cat-1']).toBeGreaterThan(0);
      expect(call.create.brandScores['brand-1']).toBeGreaterThan(0);
    });
  });

  describe('buildAnonymisedSegment', () => {
    it('returns null when fewer than MIN_COHORT_SIZE profiles match', async () => {
      mockPrisma.userAdProfile.findMany.mockResolvedValue(
        Array(MIN_COHORT_SIZE - 1).fill({
          categoryScores: { 'cat-1': 0.5 },
          brandScores: {},
          priceRangeLow: null,
          priceRangeHigh: null,
          activeHours: {},
        }),
      );
      const result = await service.buildAnonymisedSegment({ categoryIds: ['cat-1'] });
      expect(result).toBeNull();
    });

    it('returns aggregate data when cohort is large enough', async () => {
      mockPrisma.userAdProfile.findMany.mockResolvedValue(
        Array(MIN_COHORT_SIZE + 10).fill({
          categoryScores: { 'cat-1': 0.8 },
          brandScores: { 'brand-1': 1.0 },
          priceRangeLow: 30,
          priceRangeHigh: 200,
          activeHours: { '14': 5 },
        }),
      );
      const result = await service.buildAnonymisedSegment({ categoryIds: ['cat-1'] });
      expect(result).not.toBeNull();
      expect(result!.cohortSize).toBeGreaterThanOrEqual(MIN_COHORT_SIZE);
      expect(result!.topCategoryIds).toContain('cat-1');
    });
  });

  describe('scoreRelevance', () => {
    it('returns 0 for user with no profile', async () => {
      mockPrisma.userAdProfile.findUnique.mockResolvedValue(null);
      const score = await service.scoreRelevance('user-x', { categoryIds: ['cat-1'] });
      expect(score).toBe(0);
    });

    it('returns >0 when profile matches category targeting', async () => {
      mockPrisma.userAdProfile.findUnique.mockResolvedValue({
        categoryScores: { 'cat-1': 1.5 },
        brandScores: {},
        priceRangeLow: 20,
        priceRangeHigh: 300,
        interestTags: [],
      });
      const score = await service.scoreRelevance('user-1', { categoryIds: ['cat-1'] });
      expect(score).toBeGreaterThan(0);
    });
  });
});
