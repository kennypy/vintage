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
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    '0.0.0.0'
  );
}

@Controller('api/v1/ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  // POST /api/v1/ads/serve — returns best creative for this user/placement
  // Auth is optional: anonymous users get non-personalised ads
  @Post('serve')
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
