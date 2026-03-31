import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AdCampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from '../audience/audience.service';
import { BotDetectionService } from './bot-detection.service';
import { ServeAdDto } from './dto/serve-ad.dto';
import { RecordClickDto } from './dto/record-click.dto';

// CPM cost deducted per impression = budgetBrl * cpmBrl / 1000
const IMPRESSION_DEBIT_DIVISOR = 1000;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceService: AudienceService,
    private readonly botDetection: BotDetectionService,
  ) {}

  // ── Ad serving — returns the best creative for the given user/placement ──

  async serveAd(
    dto: ServeAdDto,
    userId: string | null,
    ip: string,
  ) {
    const now = new Date();
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

    // Fetch active campaigns with budget remaining and in date range
    const activeCampaigns = await this.prisma.adCampaign.findMany({
      where: {
        status: AdCampaignStatus.ACTIVE,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: {
        creatives: { where: { active: true }, take: 1 },
      },
    });

    // Filter out campaigns that have exhausted their budget
    const eligible = activeCampaigns.filter(
      (c) => Number(c.spentBrl) < Number(c.budgetBrl) && c.creatives.length > 0,
    );

    if (eligible.length === 0) return null;

    // Score relevance for authenticated users; random for anonymous
    let bestCampaign = eligible[0];
    let bestCreative = eligible[0].creatives[0];

    if (userId) {
      let bestScore = -1;
      for (const campaign of eligible) {
        const score = await this.audienceService.scoreRelevance(
          userId,
          campaign.targetAudience as Record<string, unknown>,
        );
        if (score > bestScore) {
          bestScore = score;
          bestCampaign = campaign;
          bestCreative = campaign.creatives[0];
        }
      }
    } else {
      // Anonymous — pick the campaign with the highest CPM (revenue maximisation)
      const sorted = eligible.sort(
        (a, b) => Number(b.cpmBrl) - Number(a.cpmBrl),
      );
      bestCampaign = sorted[0];
      bestCreative = sorted[0].creatives[0];
    }

    // Record impression
    const costBrl = Number(bestCampaign.cpmBrl) / IMPRESSION_DEBIT_DIVISOR;

    const impression = await this.prisma.adImpression.create({
      data: {
        campaignId: bestCampaign.id,
        creativeId: bestCreative.id,
        userId: userId ?? null,
        deviceId: dto.deviceId ?? null,
        placement: dto.placement,
        costBrl,
        ipHash,
      },
      select: { id: true },
    });

    // Deduct cost from campaign budget (best-effort, non-blocking)
    this.prisma.adCampaign
      .update({
        where: { id: bestCampaign.id },
        data: { spentBrl: { increment: costBrl } },
      })
      .catch((err: unknown) =>
        this.logger.error('Budget debit failed', String(err).slice(0, 200)),
      );

    return {
      impressionId: impression.id,
      campaignId: bestCampaign.id,
      creative: {
        id: bestCreative.id,
        title: bestCreative.title,
        body: bestCreative.body,
        imageUrl: bestCreative.imageUrl,
        ctaText: bestCreative.ctaText,
        destinationUrl: bestCreative.destinationUrl,
        format: bestCreative.format,
      },
    };
  }

  // ── Click recording with bot/fraud scoring ────────────────────────────────

  async recordClick(
    dto: RecordClickDto,
    userId: string | null,
    ip: string,
    userAgent: string,
  ) {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

    const { score, isBot, signals } = await this.botDetection.score({
      ip,
      ipHash,
      userAgent,
      msToClick: dto.msToClick,
      impressionId: dto.impressionId,
      campaignId: dto.campaignId,
      userId: userId ?? undefined,
    });

    await this.prisma.adClick.create({
      data: {
        campaignId: dto.campaignId,
        creativeId: dto.creativeId,
        impressionId: dto.impressionId ?? null,
        userId: userId ?? null,
        deviceId: dto.deviceId ?? null,
        ipHash,
        botScore: score,
        isBot,
        fraudSignals: signals as Prisma.InputJsonValue,
        msToClick: dto.msToClick ?? null,
      },
    });

    // Return the destination URL so the client can redirect
    // Only if not a bot — bots get a 200 but no redirect URL
    if (isBot) {
      this.logger.warn(
        `Bot click detected: campaignId=${dto.campaignId} score=${score}`,
      );
      return { redirectUrl: null, flagged: true };
    }

    const creative = await this.prisma.adCreative.findUnique({
      where: { id: dto.creativeId },
      select: { destinationUrl: true },
    });

    if (!creative) throw new NotFoundException('Creative não encontrado.');

    return { redirectUrl: creative.destinationUrl, flagged: false };
  }

  // ── Dashboard feed — personalized listing recommendations with ads ────────

  async getPersonalisedFeed(
    userId: string | null,
    limit = 20,
  ) {
    // Get user's top category/brand interests if authenticated
    let categoryIds: string[] = [];
    let brandIds: string[] = [];

    if (userId) {
      const profile = await this.prisma.userAdProfile.findUnique({
        where: { userId },
        select: { categoryScores: true, brandScores: true },
      });
      if (profile) {
        categoryIds = Object.entries(
          profile.categoryScores as Record<string, number>,
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([id]) => id);
        brandIds = Object.entries(
          profile.brandScores as Record<string, number>,
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([id]) => id);
      }
    }

    // Fetch listings with relevance bias toward user interests
    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        OR:
          categoryIds.length > 0 || brandIds.length > 0
            ? [
                { categoryId: { in: categoryIds } },
                { brandId: { in: brandIds } },
              ]
            : undefined,
      },
      orderBy: [{ promotedUntil: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        priceBrl: true,
        categoryId: true,
        brandId: true,
        images: { take: 1, select: { url: true } },
      },
    });

    return { listings, personalised: categoryIds.length > 0 || brandIds.length > 0 };
  }
}
