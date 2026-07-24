import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdsService } from './ads.service';
import { ServeAdDto } from './dto/serve-ad.dto';
import { RecordClickDto } from './dto/record-click.dto';

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  verified: boolean;
}

function extractIp(req: Request): string {
  // main.ts sets Express `trust proxy` to the configured hop count so
  // req.ip is the real client IP. Reading X-Forwarded-For directly
  // would let an attacker forge the IP used by the ads bot-detection
  // heuristics (velocity checks, datacenter-IP lookups) by appending
  // values of their own — flagging honest users and skewing fraud
  // scoring in their favour.
  return req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
}

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  // POST /api/v1/ads/serve — returns best creative for this user/placement
  // Auth is optional: anonymous users get non-personalised ads
  //
  // Tighter than the global 60/min: this endpoint spends an advertiser's
  // money, and the tracker keys on IP here because req.user is null for
  // the anonymous path. The per-(campaign, client) billing window in
  // AdsService is the real control; this just narrows the funnel.
  @Post('serve')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  serveAd(
    @Body() dto: ServeAdDto,
    @Req() req: Request,
    @Optional() @CurrentUser() user?: JwtPayload,
  ) {
    return this.adsService.serveAd(dto, user?.id ?? null, extractIp(req));
  }

  // POST /api/v1/ads/click — record a click and return redirect URL
  @Post('click')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  recordClick(
    @Body() dto: RecordClickDto,
    @Req() req: Request,
    @Optional() @CurrentUser() user?: JwtPayload,
  ) {
    const ua = (req.headers['user-agent'] ?? '') as string;
    return this.adsService.recordClick(dto, user?.id ?? null, extractIp(req), ua);
  }

  // GET /api/v1/ads/feed — personalised listing feed for dashboard
  @UseGuards(JwtAuthGuard)
  @Get('feed')
  getFeed(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.adsService.getPersonalisedFeed(user.id, take);
  }
}
