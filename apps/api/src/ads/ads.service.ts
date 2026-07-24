import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AdCampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from '../audience/audience.service';
import { BotDetectionService } from './bot-detection.service';
import { ServeAdDto } from './dto/serve-ad.dto';
import { RecordClickDto } from './dto/record-click.dto';

// CPM cost deducted per impression = budgetBrl * cpmBrl / 1000
const IMPRESSION_DEBIT_DIVISOR = 1000;

/**
 * One BILLABLE impression per (campaign, client) inside this window.
 *
 * POST /ads/serve carries no guard and is CSRF-excluded, and its sole
 * side effect is a monetary increment of a third party's `spentBrl`.
 * Without this, anyone can loop the endpoint and burn an advertiser's
 * budget down until `spentBrl >= budgetBrl` drops them from rotation —
 * and because the anonymous branch sorts by DESCENDING cpmBrl, the
 * highest-paying advertiser is drained first, automatically.
 *
 * NOTE: this bounds a single client's spend rate; it does NOT prove the
 * creative was rendered. A distributed attacker rotating IPs still
 * inflates spend. Closing that needs a short-lived server-signed,
 * single-use placement token issued before the debit — a change to the
 * ad-serving contract with the clients, so it is deliberately NOT done
 * here. Tracked as the residual on finding F21.
 */
const IMPRESSION_DEDUPE_WINDOW_MS = 60 * 1000;

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

    // Debit at most once per (campaign, client) per window. Repeat serves
    // inside the window still return an ad — they just aren't billable.
    const recentImpression = await this.prisma.adImpression.findFirst({
      where: {
        campaignId: bestCampaign.id,
        ipHash,
        createdAt: { gt: new Date(now.getTime() - IMPRESSION_DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    });
    const billable = !recentImpression;
    const costBrl = billable
      ? Number(bestCampaign.cpmBrl) / IMPRESSION_DEBIT_DIVISOR
      : 0;

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
    if (billable) {
      this.prisma.adCampaign
        .update({
          where: { id: bestCampaign.id },
          data: { spentBrl: { increment: costBrl } },
        })
        .catch((err: unknown) =>
          this.logger.error('Budget debit failed', String(err).slice(0, 200)),
        );
    }

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

    // POST /ads/click is unauthenticated and CSRF-excluded, so every
    // field below is attacker-chosen. Nothing used to be checked: any
    // campaignId/creativeId pair was accepted, inflating the click/CTR
    // figures partners are billed against and polluting the fraud
    // dataset, and destinationUrl came back even for inactive creatives
    // on DRAFT/PAUSED campaigns.
    const creative = await this.prisma.adCreative.findUnique({
      where: { id: dto.creativeId },
      select: {
        destinationUrl: true,
        active: true,
        campaignId: true,
        campaign: { select: { status: true } },
      },
    });
    if (!creative) throw new NotFoundException('Creative não encontrado.');
    if (creative.campaignId !== dto.campaignId) {
      throw new BadRequestException(
        'Creative não pertence à campanha informada.',
      );
    }
    if (!creative.active || creative.campaign.status !== AdCampaignStatus.ACTIVE) {
      throw new BadRequestException('Anúncio não está ativo.');
    }

    // Bind the click to an impression WE actually served to THIS client.
    const impression = await this.prisma.adImpression.findUnique({
      where: { id: dto.impressionId },
      select: { campaignId: true, creativeId: true, ipHash: true },
    });
    if (
      !impression ||
      impression.campaignId !== dto.campaignId ||
      impression.creativeId !== dto.creativeId ||
      impression.ipHash !== ipHash
    ) {
      throw new BadRequestException('Impressão inválida para este clique.');
    }

    // Consume the impression. BotDetectionService only COUNTs it, so one
    // served impressionId could be replayed indefinitely and every replay
    // scored as clean (all signals 0 except velocity at +0.4, under the
    // 0.7 threshold).
    const alreadyClicked = await this.prisma.adClick.findFirst({
      where: { impressionId: dto.impressionId },
      select: { id: true },
    });
    if (alreadyClicked) {
      throw new ConflictException('Este clique já foi registrado.');
    }

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
        impressionId: dto.impressionId,
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

    // Creative was already loaded and validated above.
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
