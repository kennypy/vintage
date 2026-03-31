import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AdCampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from '../audience/audience.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateCreativeDto } from './dto/create-creative.dto';
import { AudienceQueryDto } from './dto/audience-query.dto';

// Allowed URL schemes — prevent SSRF via javascript:, file:, etc.
const ALLOWED_URL_SCHEMES = ['http:', 'https:'];
// Private/loopback CIDR ranges — checked after DNS resolution in production
// (here we guard at URL-level; full SSRF prevention requires DNS resolution in a real deploy)
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
];

function validateUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('URL de destino inválida.');
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    throw new BadRequestException('Protocolo de URL não permitido.');
  }
  if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
    throw new BadRequestException('URL de destino não permitida (SSRF).');
  }
}

@Injectable()
export class AdPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceService: AudienceService,
  ) {}

  // ── Partner management (internal admin only) ──────────────────────────────

  async createPartner(dto: CreatePartnerDto): Promise<{
    partner: { id: string; name: string; email: string; apiKeyPrefix: string };
    apiKey: string; // returned ONCE, never stored
  }> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKeyPrefix = rawKey.slice(0, 8);

    if (dto.webhookUrl) validateUrl(dto.webhookUrl);

    // Generate a fresh HMAC webhook secret for this partner
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const partner = await this.prisma.adPartner.create({
      data: {
        name: dto.name,
        email: dto.email,
        apiKeyHash,
        apiKeyPrefix,
        canReceiveData: dto.canReceiveData ?? false,
        webhookUrl: dto.webhookUrl ?? null,
        webhookSecret,
      },
      select: { id: true, name: true, email: true, apiKeyPrefix: true },
    });

    return { partner, apiKey: rawKey };
  }

  async rotateApiKey(partnerId: string): Promise<{ apiKey: string }> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKeyPrefix = rawKey.slice(0, 8);

    await this.prisma.adPartner.update({
      where: { id: partnerId },
      data: { apiKeyHash, apiKeyPrefix },
    });
    return { apiKey: rawKey };
  }

  async deactivatePartner(partnerId: string): Promise<void> {
    await this.prisma.adPartner.update({
      where: { id: partnerId },
      data: { active: false },
    });
  }

  // ── Campaign management (partner-authenticated) ───────────────────────────

  async createCampaign(partnerId: string, dto: CreateCampaignDto) {
    return this.prisma.adCampaign.create({
      data: {
        partnerId,
        name: dto.name,
        targetAudience: dto.targetAudience ?? {},
        budgetBrl: dto.budgetBrl,
        cpmBrl: dto.cpmBrl,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        status: dto.status ?? AdCampaignStatus.DRAFT,
      },
      select: {
        id: true,
        name: true,
        status: true,
        budgetBrl: true,
        spentBrl: true,
        cpmBrl: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
      },
    });
  }

  async updateCampaignStatus(
    partnerId: string,
    campaignId: string,
    status: AdCampaignStatus,
  ) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { partnerId: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    if (campaign.partnerId !== partnerId) throw new ForbiddenException();
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: { status },
      select: { id: true, status: true },
    });
  }

  async listCampaigns(partnerId: string) {
    return this.prisma.adCampaign.findMany({
      where: { partnerId },
      select: {
        id: true,
        name: true,
        status: true,
        budgetBrl: true,
        spentBrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Creative management ───────────────────────────────────────────────────

  async createCreative(
    partnerId: string,
    campaignId: string,
    dto: CreateCreativeDto,
  ) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { partnerId: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    if (campaign.partnerId !== partnerId) throw new ForbiddenException();

    validateUrl(dto.destinationUrl);
    if (dto.imageUrl) validateUrl(dto.imageUrl);

    return this.prisma.adCreative.create({
      data: {
        campaignId,
        title: dto.title,
        body: dto.body ?? null,
        imageUrl: dto.imageUrl ?? null,
        ctaText: dto.ctaText ?? null,
        destinationUrl: dto.destinationUrl,
        format: dto.format,
      },
      select: {
        id: true,
        title: true,
        format: true,
        destinationUrl: true,
        active: true,
        createdAt: true,
      },
    });
  }

  // ── Campaign reporting ────────────────────────────────────────────────────

  async getCampaignStats(partnerId: string, campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { partnerId: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    if (campaign.partnerId !== partnerId) throw new ForbiddenException();

    const [impressionCount, clickCount, botClicks] = await Promise.all([
      this.prisma.adImpression.count({ where: { campaignId } }),
      this.prisma.adClick.count({ where: { campaignId } }),
      this.prisma.adClick.count({ where: { campaignId, isBot: true } }),
    ]);

    const legitimateClicks = clickCount - botClicks;
    const ctr =
      impressionCount > 0 ? legitimateClicks / impressionCount : 0;

    return {
      campaignId,
      impressions: impressionCount,
      clicks: legitimateClicks,
      botClicksFiltered: botClicks,
      ctr: Math.round(ctr * 10000) / 10000,
    };
  }

  // ── Anonymised audience data export (LGPD-compliant) ─────────────────────

  async getAnonymisedAudience(
    partnerId: string,
    query: AudienceQueryDto,
  ) {
    const partner = await this.prisma.adPartner.findUnique({
      where: { id: partnerId },
      select: { canReceiveData: true },
    });
    if (!partner?.canReceiveData) {
      throw new ForbiddenException(
        'Parceiro sem permissão para receber dados de audiência.',
      );
    }

    const segment = await this.audienceService.buildAnonymisedSegment({
      categoryIds: query.categoryIds,
      brandIds: query.brandIds,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
    });

    if (!segment) {
      return {
        message:
          'Segmento muito pequeno para exportação (privacidade protegida, mínimo 50 usuários).',
        data: null,
      };
    }

    return { data: segment };
  }
}
