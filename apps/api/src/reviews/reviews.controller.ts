import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
  // P-11 follow-up: cap review creation at 10/hour per caller. The
  // service layer already enforces the structural invariants
  // (one review per order, reviewer must be the buyer or seller on
  // the order, etc.), so the "real" spam ceiling is the number of
  // completed orders — but without this throttle a compromised
  // account could burn through every eligible order in a single burst
  // and torpedo a seller's rating before we have a chance to flag it.
  // 10/hour is well above any organic review velocity and well below
  // anything a griefer could do damage with.
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Avaliar pedido (1 ou 5 estrelas)' })
  create(
    @Body() body: { orderId: string; rating: number; comment?: string; imageUrls?: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewsService.create(
      user.id,
      body.orderId,
      body.rating,
      body.comment,
      body.imageUrls,
    );
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
