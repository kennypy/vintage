import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SellerInsightsService } from './seller-insights.service';

@ApiTags('seller-insights')
@Controller('seller-insights')
export class SellerInsightsController {
  constructor(private readonly sellerInsightsService: SellerInsightsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dashboard de analytics do vendedor — Sellability Score, tempo médio de venda, demanda por categoria',
  })
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.sellerInsightsService.getDashboard(user.id);
  }
}
