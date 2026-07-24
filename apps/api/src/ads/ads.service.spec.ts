import { Test, TestingModule } from '@nestjs/testing';
import { AdsService } from './ads.service';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from '../audience/audience.service';
import { BotDetectionService } from './bot-detection.service';

const mockPrisma = {
  adCampaign: { findMany: jest.fn(), update: jest.fn() },
  adImpression: {
    create: jest.fn(),
    count: jest.fn(),
    // Billing-window lookup; null = this serve is billable.
    findFirst: jest.fn().mockResolvedValue(null),
  },
  adClick: { create: jest.fn(), count: jest.fn() },
  adCreative: { findUnique: jest.fn() },
  userAdProfile: { findUnique: jest.fn() },
  listing: { findMany: jest.fn() },
};

const mockAudienceService = { scoreRelevance: jest.fn() };
const mockBotDetection = { score: jest.fn() };

describe('AdsService', () => {
  let service: AdsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AudienceService, useValue: mockAudienceService },
        { provide: BotDetectionService, useValue: mockBotDetection },
      ],
    }).compile();
    service = module.get<AdsService>(AdsService);
    jest.clearAllMocks();
    // clearAllMocks drops the inline resolved value above; restore the
    // "clean slate" default for the billing-window lookup.
    mockPrisma.adImpression.findFirst.mockResolvedValue(null);
  });

  describe('serveAd', () => {
    it('returns null when no active campaigns exist', async () => {
      mockPrisma.adCampaign.findMany.mockResolvedValue([]);
      const result = await service.serveAd(
        { placement: 'dashboard' as any, sessionId: 'sess-1' },
        null,
        '1.2.3.4',
      );
      expect(result).toBeNull();
    });

    it('returns a creative for anonymous user (highest CPM)', async () => {
      const fakeCampaign = {
        id: 'c1',
        budgetBrl: 100,
        spentBrl: 0,
        cpmBrl: 5.0,
        targetAudience: {},
        creatives: [
          {
            id: 'cr1',
            title: 'Ad',
            body: null,
            imageUrl: null,
            ctaText: null,
            destinationUrl: 'https://example.com',
            format: 'BANNER',
          },
        ],
      };
      mockPrisma.adCampaign.findMany.mockResolvedValue([fakeCampaign]);
      mockPrisma.adImpression.create.mockResolvedValue({ id: 'imp-1' });
      mockPrisma.adCampaign.update.mockResolvedValue({});
      const result = await service.serveAd(
        { placement: 'dashboard' as any, sessionId: 'sess-1' },
        null,
        '1.2.3.4',
      );
      expect(result?.creative.id).toBe('cr1');
      expect(result?.impressionId).toBe('imp-1');
      // First serve in the window is billable.
      expect(mockPrisma.adCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { spentBrl: { increment: 5.0 / 1000 } },
        }),
      );
    });

    it('does NOT debit the advertiser again inside the billing window', async () => {
      const fakeCampaign = {
        id: 'c1',
        budgetBrl: 100,
        spentBrl: 0,
        cpmBrl: 5.0,
        targetAudience: {},
        creatives: [
          {
            id: 'cr1',
            title: 'Ad',
            body: null,
            imageUrl: null,
            ctaText: null,
            destinationUrl: 'https://example.com',
            format: 'BANNER',
          },
        ],
      };
      mockPrisma.adCampaign.findMany.mockResolvedValue([fakeCampaign]);
      mockPrisma.adImpression.create.mockResolvedValue({ id: 'imp-2' });
      // Same client already had a billable impression for this campaign.
      mockPrisma.adImpression.findFirst.mockResolvedValue({ id: 'imp-1' });

      const result = await service.serveAd(
        { placement: 'dashboard' as any, sessionId: 'sess-1' },
        null,
        '1.2.3.4',
      );

      // Ad is still served — it just isn't billed. Looping this endpoint
      // used to burn the highest-CPM advertiser's budget to zero.
      expect(result?.creative.id).toBe('cr1');
      expect(mockPrisma.adCampaign.update).not.toHaveBeenCalled();
    });
  });

  describe('recordClick', () => {
    it('returns flagged=true and no redirect for bot clicks', async () => {
      mockBotDetection.score.mockResolvedValue({
        score: 0.9,
        isBot: true,
        signals: { uaIsBot: true },
      });
      mockPrisma.adClick.create.mockResolvedValue({});
      const result = await service.recordClick(
        {
          impressionId: 'imp-1',
          creativeId: 'cr1',
          campaignId: 'c1',
        },
        null,
        '10.0.0.1',
        'Googlebot/2.1',
      );
      expect(result.flagged).toBe(true);
      expect(result.redirectUrl).toBeNull();
    });

    it('returns redirect URL for legitimate clicks', async () => {
      mockBotDetection.score.mockResolvedValue({
        score: 0.1,
        isBot: false,
        signals: {},
      });
      mockPrisma.adClick.create.mockResolvedValue({});
      mockPrisma.adCreative.findUnique.mockResolvedValue({
        destinationUrl: 'https://parceiro.com.br/promo',
      });
      const result = await service.recordClick(
        {
          impressionId: 'imp-2',
          creativeId: 'cr1',
          campaignId: 'c1',
          msToClick: 1500,
        },
        'user-1',
        '200.200.200.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      );
      expect(result.flagged).toBe(false);
      expect(result.redirectUrl).toBe('https://parceiro.com.br/promo');
    });
  });
});
