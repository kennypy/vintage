import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConsentService } from './consent.service';
import { UpdateConsentDto } from './dto/update-consent.dto';

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  verified: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  // GET /api/v1/consent — return all consent states for the authenticated user
  @Get()
  getConsents(@CurrentUser() user: JwtPayload) {
    return this.consentService.getConsents(user.id);
  }

  // POST /api/v1/consent — grant or revoke a consent type
  @Post()
  updateConsent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateConsentDto,
    @Req() req: Request,
  ) {
    // Use Express' resolved req.ip — main.ts sets `trust proxy` to
    // TRUSTED_PROXY_HOPS so the hop count we actually run behind is what
    // decides the client address. Reading X-Forwarded-For directly let
    // the caller pick the IP hashed into their own LGPD ConsentRecord,
    // so they could later repudiate a grant they made ("that address
    // isn't mine"). Mirrors auth.controller.ts and captcha.guard.ts.
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return this.consentService.updateConsent(user.id, dto.consentType, dto.granted, ip);
  }
}
