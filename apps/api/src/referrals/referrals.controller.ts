import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReferralsService } from './referrals.service';

@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Meu código de indicação + lista de convidados' })
  async me(@CurrentUser() user: AuthUser) {
    return this.referrals.getMyReferrals(user.id);
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Verifica se um código de indicação é válido (uso público no fluxo de signup)' })
  async validate(@Param('code') code: string) {
    return this.referrals.validateCode(code);
  }
}
