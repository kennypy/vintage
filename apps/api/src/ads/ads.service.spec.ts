import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
    findUnique: jest.fn(),
  },
  adClick: {
    create: jest.fn(),
    count: jest.fn(),
    // Single-use check; null = this impression hasn't been clicked yet.
    findFirst: jest.fn().mockResolvedValue(null),
  },
  adCreative: { findUnique: jest.fn() },
  userAdProfile: { findUnique: jest.fn() },
  listing: { findMany: jest.fn() },
};

/** Mirrors the service's ipHash derivation. */
const hashIp = (ip: string) =>
  crypto.createHash('sha256').update(ip).digest('hex');

/** A creative that passes every recordClick pairing check. */
const validCreative = {
  destinationUrl: 'https://parceiro.com.br/promo',
  active: true,
  campaignId: 'c1',
  campaign: { status: 'ACTIVE' },
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
    // clearAllMocks drops the inline resolved values above; restore the
    // "clean slate" defaults for the two new lookups.
    mockPrisma.adImpression.findFirst.mockResolvedValue(null);
    mockPrisma.adClick.findFirst.mockResolvedValue(null);
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
      mockPrisma.adCreative.findUnique.mockResolvedValue(validCreative);
      mockPrisma.adImpression.findUnique.mockResolvedValue({
        campaignId: 'c1',
        creativeId: 'cr1',
        ipHash: hashIp('10.0.0.1'),
      });
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
      mockPrisma.adCreative.findUnique.mockResolvedValue(validCreative);
      mockPrisma.adImpression.findUnique.mockResolvedValue({
        campaignId: 'c1',
        creativeId: 'cr1',
        ipHash: hashIp('200.200.200.1'),
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

    // ── F26: every field below is attacker-chosen (unauthenticated,
    // CSRF-excluded), so each pairing must be proven against the DB.
    const legitClick = {
      impressionId: 'imp-3',
      creativeId: 'cr1',
      campaignId: 'c1',
    };
    const clientIp = '200.200.200.2';

    const setUpValidClick = () => {
      mockBotDetection.score.mockResolvedValue({
        score: 0.1,
        isBot: false,
        signals: {},
      });
      mockPrisma.adClick.create.mockResolvedValue({});
      mockPrisma.adCreative.findUnique.mockResolvedValue(validCreative);
      mockPrisma.adImpression.findUnique.mockResolvedValue({
        campaignId: 'c1',
        creativeId: 'cr1',
        ipHash: hashIp(clientIp),
      });
    };

    it('rejects a creative that belongs to a different campaign', async () => {
      setUpValidClick();
      mockPrisma.adCreative.findUnique.mockResolvedValue({
        ...validCreative,
        campaignId: 'someone-elses-campaign',
      });

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });

    it('rejects a click on an inactive creative', async () => {
      setUpValidClick();
      mockPrisma.adCreative.findUnique.mockResolvedValue({
        ...validCreative,
        active: false,
      });

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });

    it('rejects a click on a PAUSED campaign', async () => {
      setUpValidClick();
      mockPrisma.adCreative.findUnique.mockResolvedValue({
        ...validCreative,
        campaign: { status: 'PAUSED' },
      });

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });

    it('rejects an impression that was served to a different client', async () => {
      setUpValidClick();
      mockPrisma.adImpression.findUnique.mockResolvedValue({
        campaignId: 'c1',
        creativeId: 'cr1',
        ipHash: hashIp('9.9.9.9'),
      });

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown impressionId', async () => {
      setUpValidClick();
      mockPrisma.adImpression.findUnique.mockResolvedValue(null);

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });

    it('refuses to replay an impression that was already clicked', async () => {
      setUpValidClick();
      mockPrisma.adClick.findFirst.mockResolvedValue({ id: 'click-1' });

      await expect(
        service.recordClick(legitClick, null, clientIp, 'Mozilla/5.0'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.adClick.create).not.toHaveBeenCalled();
    });
  });
});
