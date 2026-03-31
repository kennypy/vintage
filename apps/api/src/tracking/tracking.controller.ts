import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TrackingService } from './tracking.service';
import { TrackEventDto } from './dto/track-event.dto';

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  verified: boolean;
}

@Controller('api/v1/tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  // POST /api/v1/tracking/event
  // Accepts anonymous and authenticated events. Auth is optional here.
  @Post('event')
  @HttpCode(HttpStatus.NO_CONTENT)
  async trackEvent(
    @Body() dto: TrackEventDto,
    @Req() req: Request,
    @Optional() @CurrentUser() user?: JwtPayload,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';
    await this.trackingService.trackEvent(dto, user?.id ?? null, ip);
  }

  // GET /api/v1/tracking/events — LGPD right to access own data
  @UseGuards(JwtAuthGuard)
  @Get('events')
  getMyEvents(@CurrentUser() user: JwtPayload) {
    return this.trackingService.getUserEvents(user.id);
  }

  // DELETE /api/v1/tracking — LGPD right to erasure of tracking data
  @UseGuards(JwtAuthGuard)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyData(@CurrentUser() user: JwtPayload) {
    await this.trackingService.deleteUserTrackingData(user.id);
  }
}
