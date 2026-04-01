import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ImpactService } from './impact.service';

@ApiTags('impact')
@Controller('impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Get('platform')
  @ApiOperation({ summary: 'Impacto ambiental cumulativo da plataforma (público)' })
  getPlatformImpact() {
    return this.impactService.getPlatformImpact();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Meu impacto circular — CO₂, água, selos conquistados' })
  getMyImpact(@CurrentUser() user: AuthUser) {
    return this.impactService.getUserImpact(user.id);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Impacto circular de um usuário (público — para perfil de vendedor)' })
  getUserImpact(@Param('userId') userId: string) {
    return this.impactService.getUserImpact(userId);
  }

  @Get('orders/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Impacto ambiental de um pedido específico (tela de confirmação)' })
  getOrderImpact(@Param('orderId') orderId: string, @CurrentUser() user: AuthUser) {
    return this.impactService.getOrderImpact(orderId, user.id);
  }
}
