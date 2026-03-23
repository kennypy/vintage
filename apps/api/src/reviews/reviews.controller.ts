import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('reviews')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Avaliar pedido (1 ou 5 estrelas)' })
  create(
    @Body() body: { orderId: string; rating: number; comment?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewsService.create(user.id, body.orderId, body.rating, body.comment);
  }

  @Get('users/:id/reviews')
  @ApiOperation({ summary: 'Ver avaliações do usuário' })
  getUserReviews(
    @Param('id') id: string,
    @Query('page') page: number = 1,
  ) {
    return this.reviewsService.getUserReviews(id, page);
  }
}
