import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('reviews')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create review for order' })
  create(@Body() _body: any) {
    return { message: 'TODO' };
  }

  @Get('users/:id/reviews')
  @ApiOperation({ summary: "Get user's reviews" })
  getUserReviews(@Param('id') _id: string) {
    return { message: 'TODO' };
  }
}
