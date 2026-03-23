import {
  Controller, Get, Post, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PromotionsService } from './promotions.service';

@ApiTags('promotions')
@Controller('promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('megafone')
  @ApiOperation({ summary: 'Criar megafone — impulso gratuito para anúncios novos' })
  createMegafone(
    @Body() body: { listingId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotionsService.createMegafone(body.listingId, user.id);
  }

  @Post('bump')
  @ApiOperation({ summary: 'Criar bump — impulso pago de R$4,90 por 3 dias' })
  createBump(
    @Body() body: { listingId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotionsService.createBump(body.listingId, user.id);
  }

  @Post('spotlight')
  @ApiOperation({ summary: 'Criar destaque — promoção de closet por R$29,90 por 7 dias' })
  createSpotlight(@CurrentUser() user: AuthUser) {
    return this.promotionsService.createSpotlight(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar promoções ativas do usuário' })
  getActivePromotions(@CurrentUser() user: AuthUser) {
    return this.promotionsService.getActivePromotions(user.id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Ver estatísticas da promoção (visualizações e cliques)' })
  getPromotionStats(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotionsService.getPromotionStats(id, user.id);
  }
}
