import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdCampaignStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdPartnerAuthGuard, PartnerRequest } from './ad-partner-auth.guard';
import { AdPartnersService } from './ad-partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateCreativeDto } from './dto/create-creative.dto';
import { AudienceQueryDto } from './dto/audience-query.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Internal admin endpoints — protected by JWT (platform admin only)
// ─────────────────────────────────────────────────────────────────────────────
@UseGuards(JwtAuthGuard)
@Controller('api/v1/admin/ad-partners')
export class AdPartnersAdminController {
  constructor(private readonly service: AdPartnersService) {}

  // POST /api/v1/admin/ad-partners — create a new ad partner, returns API key once
  @Post()
  createPartner(@Body() dto: CreatePartnerDto) {
    return this.service.createPartner(dto);
  }

  // POST /api/v1/admin/ad-partners/:id/rotate-key — rotate partner API key
  @Post(':id/rotate-key')
  rotateKey(@Param('id') id: string) {
    return this.service.rotateApiKey(id);
  }

  // PATCH /api/v1/admin/ad-partners/:id/deactivate — disable a partner
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.service.deactivatePartner(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner-facing endpoints — authenticated via X-Partner-Key header
// ─────────────────────────────────────────────────────────────────────────────
@UseGuards(AdPartnerAuthGuard)
@Controller('api/v1/partner')
export class AdPartnersController {
  constructor(private readonly service: AdPartnersService) {}

  // GET /api/v1/partner/campaigns
  @Get('campaigns')
  listCampaigns(@Req() req: PartnerRequest) {
    return this.service.listCampaigns(req.partner.id);
  }

  // POST /api/v1/partner/campaigns
  @Post('campaigns')
  createCampaign(@Req() req: PartnerRequest, @Body() dto: CreateCampaignDto) {
    return this.service.createCampaign(req.partner.id, dto);
  }

  // PATCH /api/v1/partner/campaigns/:id/status
  @Patch('campaigns/:id/status')
  updateStatus(
    @Req() req: PartnerRequest,
    @Param('id') campaignId: string,
    @Body('status') status: AdCampaignStatus,
  ) {
    return this.service.updateCampaignStatus(req.partner.id, campaignId, status);
  }

  // POST /api/v1/partner/campaigns/:id/creatives
  @Post('campaigns/:id/creatives')
  createCreative(
    @Req() req: PartnerRequest,
    @Param('id') campaignId: string,
    @Body() dto: CreateCreativeDto,
  ) {
    return this.service.createCreative(req.partner.id, campaignId, dto);
  }

  // GET /api/v1/partner/campaigns/:id/stats
  @Get('campaigns/:id/stats')
  getStats(@Req() req: PartnerRequest, @Param('id') campaignId: string) {
    return this.service.getCampaignStats(req.partner.id, campaignId);
  }

  // GET /api/v1/partner/audience — anonymised audience data (LGPD-compliant)
  @Get('audience')
  getAudience(@Req() req: PartnerRequest, @Query() query: AudienceQueryDto) {
    return this.service.getAnonymisedAudience(req.partner.id, query);
  }
}
