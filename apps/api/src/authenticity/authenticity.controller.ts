import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayMinSize, ArrayMaxSize, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { AuthenticityService } from './authenticity.service';

class SubmitAuthenticityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  proofImageUrls!: string[];
}

class ReviewAuthenticityDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reviewNote?: string;
}

@ApiTags('authenticity')
@Controller()
export class AuthenticityController {
  constructor(private readonly authenticityService: AuthenticityService) {}

  @Post('listings/:listingId/authenticity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicitar selo Autêntico para um anúncio (envie fotos de comprovante)' })
  submitRequest(
    @Param('listingId') listingId: string,
    @Body() dto: SubmitAuthenticityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.authenticityService.submitRequest(user.id, listingId, dto.proofImageUrls);
  }

  @Get('listings/:listingId/authenticity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver status da solicitação de autenticidade do anúncio' })
  getRequest(
    @Param('listingId') listingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.authenticityService.getRequestByListing(listingId, user.id);
  }

  @Get('admin/authenticity/pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Listar solicitações de autenticidade pendentes' })
  listPending(@Query('page') page: number = 1) {
    return this.authenticityService.listPending(page);
  }

  @Patch('admin/authenticity/:requestId/review')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Aprovar ou rejeitar solicitação de autenticidade' })
  reviewRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewAuthenticityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.authenticityService.reviewRequest(requestId, user.id, dto.decision, dto.reviewNote);
  }
}
