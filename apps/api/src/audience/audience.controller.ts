import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AudienceService } from './audience.service';

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  verified: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/audience')
export class AudienceController {
  constructor(private readonly audienceService: AudienceService) {}

  // GET /api/v1/audience/profile — user views their own interest profile
  @Get('profile')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.audienceService.getProfile(user.id);
  }

  // POST /api/v1/audience/profile/refresh — trigger profile recomputation
  @Post('profile/refresh')
  async refreshProfile(@CurrentUser() user: JwtPayload) {
    await this.audienceService.computeProfile(user.id);
    return { message: 'Perfil de interesses atualizado.' };
  }
}
