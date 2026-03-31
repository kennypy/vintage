import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdPartnersService } from './ad-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from '../audience/audience.service';

const mockPrisma = {
  adPartner: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  adCampaign: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  adCreative: { create: jest.fn() },
  adImpression: { count: jest.fn() },
  adClick: { count: jest.fn() },
};

const mockAudienceService = {
  buildAnonymisedSegment: jest.fn(),
};

describe('AdPartnersService', () => {
  let service: AdPartnersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdPartnersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AudienceService, useValue: mockAudienceService },
      ],
    }).compile();
    service = module.get<AdPartnersService>(AdPartnersService);
    jest.clearAllMocks();
  });

  describe('createPartner', () => {
    it('returns a one-time API key and partner details', async () => {
      mockPrisma.adPartner.create.mockResolvedValue({
        id: 'p1',
        name: 'Parceiro Teste',
        email: 'test@example.com',
        apiKeyPrefix: 'abcd1234',
      });
      const result = await service.createPartner({
        name: 'Parceiro Teste',
        email: 'test@example.com',
      });
      expect(result.apiKey).toHaveLength(64);
      expect(result.partner.id).toBe('p1');
    });
  });

  describe('rotateApiKey', () => {
    it('generates a new 64-char key', async () => {
      mockPrisma.adPartner.update.mockResolvedValue({});
      const result = await service.rotateApiKey('p1');
      expect(result.apiKey).toHaveLength(64);
    });
  });

  describe('createCreative', () => {
    it('throws on blocked SSRF URL', async () => {
      mockPrisma.adCampaign.findUnique.mockResolvedValue({ partnerId: 'p1' });
      await expect(
        service.createCreative('p1', 'c1', {
          title: 'Ad',
          destinationUrl: 'http://localhost/admin',
          format: 'BANNER' as any,
        }),
      ).rejects.toThrow('SSRF');
    });

    it('throws when partner does not own campaign', async () => {
      mockPrisma.adCampaign.findUnique.mockResolvedValue({ partnerId: 'other' });
      await expect(
        service.createCreative('p1', 'c1', {
          title: 'Ad',
          destinationUrl: 'https://exemplo.com.br/loja',
          format: 'BANNER' as any,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getAnonymisedAudience', () => {
    it('throws ForbiddenException when partner lacks data permission', async () => {
      mockPrisma.adPartner.findUnique.mockResolvedValue({ canReceiveData: false });
      await expect(
        service.getAnonymisedAudience('p1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns null data message when cohort too small', async () => {
      mockPrisma.adPartner.findUnique.mockResolvedValue({ canReceiveData: true });
      mockAudienceService.buildAnonymisedSegment.mockResolvedValue(null);
      const result = await service.getAnonymisedAudience('p1', {});
      expect(result.data).toBeNull();
    });

    it('returns aggregate data when cohort is sufficient', async () => {
      mockPrisma.adPartner.findUnique.mockResolvedValue({ canReceiveData: true });
      mockAudienceService.buildAnonymisedSegment.mockResolvedValue({
        cohortSize: 200,
        topCategoryIds: ['cat-1'],
        topBrandIds: [],
        priceRangeLow: 20,
        priceRangeHigh: 300,
        activeHourPeak: 14,
        ageRangePct: {},
      });
      const result = await service.getAnonymisedAudience('p1', {});
      expect(result.data?.cohortSize).toBe(200);
    });
  });

  describe('getCampaignStats', () => {
    it('throws NotFoundException for unknown campaign', async () => {
      mockPrisma.adCampaign.findUnique.mockResolvedValue(null);
      await expect(service.getCampaignStats('p1', 'bad')).rejects.toThrow(NotFoundException);
    });

    it('returns stats with bot clicks filtered', async () => {
      mockPrisma.adCampaign.findUnique.mockResolvedValue({ partnerId: 'p1' });
      mockPrisma.adImpression.count.mockResolvedValue(1000);
      mockPrisma.adClick.count
        .mockResolvedValueOnce(30) // total clicks
        .mockResolvedValueOnce(5); // bot clicks
      const stats = await service.getCampaignStats('p1', 'c1');
      expect(stats.clicks).toBe(25);
      expect(stats.botClicksFiltered).toBe(5);
      expect(stats.ctr).toBeCloseTo(0.025);
    });
  });
});
