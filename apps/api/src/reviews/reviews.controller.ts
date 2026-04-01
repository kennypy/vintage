import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';

class ReplyToReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reply!: string;
}

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
  @ApiOperation({ summary: 'Ver avaliações do usuário (inclui respostas do vendedor)' })
  getUserReviews(
    @Param('id') id: string,
    @Query('page') page: number = 1,
  ) {
    return this.reviewsService.getUserReviews(id, page);
  }

  // Alias used by the mobile client
  @Get('reviews/:userId')
  @ApiOperation({ summary: 'Ver avaliações do usuário (alias mobile)' })
  getUserReviewsAlias(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
  ) {
    return this.reviewsService.getUserReviews(userId, page);
  }

  @Patch('reviews/:id/reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vendedor responde publicamente a uma avaliação recebida (uma vez por avaliação)' })
  replyToReview(
    @Param('id') id: string,
    @Body() body: ReplyToReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewsService.replyToReview(id, user.id, body.reply);
  }
}
