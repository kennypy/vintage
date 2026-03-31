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
@Controller('api/v1/consent')
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
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? '0.0.0.0';
    return this.consentService.updateConsent(user.id, dto.consentType, dto.granted, ip);
  }
}
